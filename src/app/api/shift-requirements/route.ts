import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shiftRequirements } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';

// シフト必要人数取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');
    const dayOfWeek = searchParams.get('dayOfWeek');

    if (!storeId) {
      return NextResponse.json({ error: '店舗IDが必要です' }, { status: 400 });
    }

    const storeIdNum = parseInt(storeId);

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, storeIdNum)) {
      return NextResponse.json({ error: 'この店舗へのアクセス権限がありません' }, { status: 403 });
    }

    const conditions = [eq(shiftRequirements.storeId, storeIdNum)];

    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      conditions.push(eq(shiftRequirements.dayOfWeek, parseInt(dayOfWeek)));
    }

    const requirements = await db
      .select()
      .from(shiftRequirements)
      .where(and(...conditions));

    return NextResponse.json(
      requirements.map((r) => ({
        ...r,
        timeSlot: r.timeSlot.slice(0, 5),
      }))
    );
  } catch (error) {
    console.error('シフト必要人数取得エラー:', error);
    return NextResponse.json({ error: 'シフト必要人数の取得に失敗しました' }, { status: 500 });
  }
}

// シフト必要人数一括更新
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    const { storeId, dayOfWeek, requirements } = body;

    if (!storeId || dayOfWeek === undefined || !Array.isArray(requirements)) {
      return NextResponse.json({ error: '必須フィールドが不足しています' }, { status: 400 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, storeId)) {
      return NextResponse.json({ error: 'この店舗へのアクセス権限がありません' }, { status: 403 });
    }

    // 該当曜日の設定を削除
    await db.delete(shiftRequirements).where(
      and(
        eq(shiftRequirements.storeId, storeId),
        eq(shiftRequirements.dayOfWeek, dayOfWeek)
      )
    );

    // 新しい設定を挿入
    if (requirements.length > 0) {
      const newRequirements = requirements.map((r: { timeSlot: string; requiredCount: number }) => ({
        storeId,
        dayOfWeek,
        timeSlot: r.timeSlot,
        requiredCount: r.requiredCount,
      }));

      await db.insert(shiftRequirements).values(newRequirements);
    }

    // 更新後の設定を取得
    const updatedRequirements = await db
      .select()
      .from(shiftRequirements)
      .where(and(
        eq(shiftRequirements.storeId, storeId),
        eq(shiftRequirements.dayOfWeek, dayOfWeek)
      ));

    return NextResponse.json(
      updatedRequirements.map((r) => ({
        ...r,
        timeSlot: r.timeSlot.slice(0, 5),
      }))
    );
  } catch (error) {
    console.error('シフト必要人数更新エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'シフト必要人数の更新に失敗しました' }, { status: 500 });
  }
}
