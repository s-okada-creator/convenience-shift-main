import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, staffHelpResponses, staff, stores, notifications } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { formatDateForLine, notifyStoreManagers } from '@/lib/line';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// スタッフ直接応募
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const requestId = parseInt(id);
    const body = await request.json();

    const { offerStart, offerEnd, message } = body;

    if (!offerStart || !offerEnd) {
      throw ApiErrors.badRequest('勤務可能な時間帯を入力してください');
    }

    // 時間バリデーション
    if (offerStart >= offerEnd) {
      throw ApiErrors.badRequest('終了時間は開始時間より後にしてください');
    }

    // ヘルプ要請の存在確認
    const [helpRequest] = await db.select().from(helpRequests).where(eq(helpRequests.id, requestId));
    if (!helpRequest) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    // 受付可能なステータスかチェック
    if (helpRequest.status === 'confirmed' || helpRequest.status === 'withdrawn' || helpRequest.status === 'closed') {
      throw ApiErrors.badRequest('このヘルプ要請には応募できません');
    }

    // 重複応募チェック
    const existing = await db
      .select()
      .from(staffHelpResponses)
      .where(
        and(
          eq(staffHelpResponses.requestId, requestId),
          eq(staffHelpResponses.staffId, session.id),
          eq(staffHelpResponses.status, 'pending')
        )
      );

    if (existing.length > 0) {
      throw ApiErrors.badRequest('既にこのヘルプ要請に応募済みです');
    }

    // 要請時間との部分一致判定
    const needStart = helpRequest.needStart.slice(0, 5);
    const needEnd = helpRequest.needEnd.slice(0, 5);
    const isPartial = offerStart > needStart || offerEnd < needEnd;

    // 応募レコード作成
    const [response] = await db.insert(staffHelpResponses).values({
      requestId,
      staffId: session.id,
      offerStart,
      offerEnd,
      isPartial,
      message: message || null,
      status: 'pending',
    }).returning();

    // ヘルプ要請のステータスをofferedに更新（openの場合）
    if (helpRequest.status === 'open') {
      await db
        .update(helpRequests)
        .set({ status: 'offered', updatedAt: new Date() })
        .where(eq(helpRequests.id, requestId));
    }

    // 要請元の店長・オーナーに通知
    const [store] = await db.select().from(stores).where(eq(stores.id, helpRequest.storeId));
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, session.id));
    const [staffStore] = await db.select().from(stores).where(eq(stores.id, session.storeId!));

    // 要請元店舗のマネージャー + オーナーに通知
    const managers = await db
      .select({ id: staff.id })
      .from(staff)
      .where(
        or(
          eq(staff.role, 'owner'),
          and(eq(staff.role, 'manager'), eq(staff.storeId, helpRequest.storeId))
        )
      );

    const notificationRecords = managers.map(m => ({
      userId: m.id,
      type: 'staff_help_response',
      payload: {
        helpRequestId: requestId,
        responseId: response.id,
        staffName: staffMember?.name || session.name,
        staffStoreName: staffStore?.name || '',
        offerStart,
        offerEnd,
        isPartial,
        message: message || null,
      },
    }));

    if (notificationRecords.length > 0) {
      await db.insert(notifications).values(notificationRecords);
    }

    // LINE通知（失敗しても応募自体は成功とする）
    try {
      const formattedDate = formatDateForLine(helpRequest.needDate);
      const lineMessage = `🟡【スタッフ応募】${staffMember?.name || session.name}さん（${staffStore?.name || ''}）が ${store?.name || ''}の ${formattedDate} ${offerStart}〜${offerEnd} に「出れます」と応募しました\n\n👉 アプリで確認・確定してください`;
      await notifyStoreManagers(helpRequest.storeId, lineMessage);
    } catch (lineError) {
      console.error('LINE通知エラー（応募自体は成功）:', lineError);
    }

    return NextResponse.json({
      ...response,
      offerStart: response.offerStart.slice(0, 5),
      offerEnd: response.offerEnd.slice(0, 5),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/help-requests/[id]/respond');
  }
}
