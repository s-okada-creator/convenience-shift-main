import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, stores, staff, notifications } from '@/lib/db/schema';
import { eq, and, gte, lte, or } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { sendDiscordNotification, formatDateForDiscord } from '@/lib/discord';
import { sendLineHelpRequestNotification } from '@/lib/line';

const normalizeTime = <T extends { needStart: string; needEnd: string }>(row: T) => ({
  ...row,
  needStart: row.needStart.slice(0, 5),
  needEnd: row.needEnd.slice(0, 5),
});

// ヘルプ要請一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const conditions = [];

    // storeIdが指定されている場合はフィルタ（アクセス権チェックも実施）
    if (storeId) {
      const storeIdNum = parseInt(storeId);
      if (!canAccessStore(session, storeIdNum)) {
        throw ApiErrors.forbidden();
      }
      conditions.push(eq(helpRequests.storeId, storeIdNum));
    } else {
      // storeId未指定の場合、全ロールが全店舗のヘルプ要請を閲覧可能
      // マネージャー: 他店のヘルプに応えるため
      // スタッフ: 直接応募するため
    }

    if (status) {
      conditions.push(eq(helpRequests.status, status as 'open' | 'offered' | 'confirmed' | 'closed' | 'withdrawn'));
    }
    if (startDate) {
      conditions.push(gte(helpRequests.needDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(helpRequests.needDate, endDate));
    }

    const query = db
      .select({
        id: helpRequests.id,
        storeId: helpRequests.storeId,
        storeName: stores.name,
        requestedBy: helpRequests.requestedBy,
        requestedByName: staff.name,
        needDate: helpRequests.needDate,
        needStart: helpRequests.needStart,
        needEnd: helpRequests.needEnd,
        memo: helpRequests.memo,
        status: helpRequests.status,
        staffNotified: helpRequests.staffNotified,
        createdAt: helpRequests.createdAt,
        updatedAt: helpRequests.updatedAt,
      })
      .from(helpRequests)
      .leftJoin(stores, eq(helpRequests.storeId, stores.id))
      .leftJoin(staff, eq(helpRequests.requestedBy, staff.id));

    const result = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    return NextResponse.json(result.map(normalizeTime));
  } catch (error) {
    return handleApiError(error, 'GET /api/help-requests');
  }
}

// ヘルプ要請作成
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    const { storeId, needDate, needStart, needEnd, memo } = body;

    if (!needDate || !needStart || !needEnd) {
      throw ApiErrors.badRequest('必須フィールドが不足しています');
    }

    // 店舗IDはセッションから自動設定（オーナーの場合はbodyから取得可）
    const targetStoreId = session.role === 'owner' ? (storeId || session.storeId) : session.storeId;
    if (!targetStoreId) {
      throw ApiErrors.badRequest('店舗IDが必要です');
    }

    if (!canAccessStore(session, targetStoreId)) {
      throw ApiErrors.forbidden();
    }

    // 店舗名を取得
    const [store] = await db.select().from(stores).where(eq(stores.id, targetStoreId));
    if (!store) {
      throw ApiErrors.badRequest(`店舗(ID=${targetStoreId})が見つかりません。再ログインしてください。`);
    }

    // requestedByに使うスタッフIDがDBに存在するか確認
    const [requester] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, session.id));
    if (!requester) {
      throw ApiErrors.badRequest(`スタッフ(ID=${session.id})が見つかりません。再ログインしてください。`);
    }

    // ヘルプ要請を作成
    const [newRequest] = await db.insert(helpRequests).values({
      storeId: targetStoreId,
      requestedBy: session.id,
      needDate,
      needStart,
      needEnd,
      memo: memo || null,
      status: 'open',
      staffNotified: false,
    }).returning();

    // マネージャー・オーナー一覧取得（通知レコード作成 + LINE通知で使用）
    const managers = await db
      .select({ id: staff.id, lineUserId: staff.lineUserId })
      .from(staff)
      .where(
        or(eq(staff.role, 'owner'), eq(staff.role, 'manager'))
      );

    // 全マネージャー・オーナーに通知レコードを作成（失敗してもヘルプ要請は成功とする）
    try {
      const notificationRecords = managers
        .filter((m) => m.id !== session.id)
        .map((m) => ({
          userId: m.id,
          type: 'help_request_created',
          payload: {
            helpRequestId: newRequest.id,
            storeId: targetStoreId,
            storeName: store.name,
            needDate,
            needStart,
            needEnd,
            memo: memo || null,
          },
        }));

      if (notificationRecords.length > 0) {
        await db.insert(notifications).values(notificationRecords);
      }
    } catch (notifError) {
      console.error('通知レコード作成エラー（要請自体は成功）:', notifError);
    }

    // Discord通知送信（失敗してもヘルプ要請は成功とする）
    try {
      const formattedDate = formatDateForDiscord(needDate);
      const discordMessage = `🔴【緊急ヘルプ】${store.name}より ${formattedDate} ${needStart.slice(0, 5)}〜${needEnd.slice(0, 5)} の人員要請が届きました\nメモ: ${memo || 'なし'}`;
      await sendDiscordNotification(discordMessage, true);
    } catch (discordError) {
      console.error('Discord通知エラー（要請自体は成功）:', discordError);
    }

    // LINE通知送信：自分以外の店長にプッシュ通知（失敗してもヘルプ要請は成功とする）
    try {
      const lineUserIds = managers
        .filter((m) => m.id !== session.id && m.lineUserId)
        .map((m) => m.lineUserId!);

      if (lineUserIds.length > 0) {
        await sendLineHelpRequestNotification(
          lineUserIds,
          store.name,
          needDate,
          needStart.slice(0, 5),
          needEnd.slice(0, 5),
          memo || null
        );
      }
    } catch (lineError) {
      console.error('LINE通知エラー（要請自体は成功）:', lineError);
    }

    return NextResponse.json(normalizeTime(newRequest), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/help-requests');
  }
}
