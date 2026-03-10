import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

interface CrossStoreRequestBody {
  // 要請元情報
  fromStoreId: number;
  fromStoreName: string;
  // 要請先情報
  toStoreId: number;
  toStoreName: string;
  // 対象日
  date: string;
  // 希望スタッフ
  staffId: number;
  staffName: string;
  // 不足時間帯
  shortageSlots: string[];
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    // スタッフは要請を出せない
    if (session.role === 'staff') {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    // リクエストボディを取得
    const body: CrossStoreRequestBody = await request.json();

    // Webhook URLを取得
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('DISCORD_WEBHOOK_URL is not set');
      return NextResponse.json(
        { error: 'Discord通知の設定がされていません' },
        { status: 500 }
      );
    }

    // 日付をフォーマット
    const [year, month, day] = body.date.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const formattedDate = `${year}年${parseInt(month)}月${parseInt(day)}日（${weekdays[dateObj.getDay()]}）`;

    // 要請者の役職
    const requesterRole = session.role === 'owner' ? 'オーナー' : '店長';

    // Discord メッセージを作成
    const message = `@everyone

お疲れ様です。シフト人員が不足しているため、スタッフの応援をご検討いただきたくご連絡いたしました。

- **要請元**: ${body.fromStoreName}（${session.name} / ${requesterRole}）
- **要請先**: ${body.toStoreName}（店長宛）
- **希望スタッフ**: ${body.staffName} さん
- **日付**: ${formattedDate}
- **不足している時間帯**: ${body.shortageSlots.join(', ') || 'なし'}

対応可否含め、ご確認をお願いいたします。`;

    const discordPayload = {
      content: message,
    };

    // Discordに通知を送信
    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(discordPayload),
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error('Discord webhook error:', errorText);
      return NextResponse.json(
        { error: 'Discord通知の送信に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '要請を送信しました',
    });
  } catch (error) {
    console.error('Cross-store request error:', error);
    return NextResponse.json(
      { error: '要請の送信に失敗しました' },
      { status: 500 }
    );
  }
}
