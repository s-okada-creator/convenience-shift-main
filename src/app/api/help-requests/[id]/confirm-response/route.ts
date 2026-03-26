import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, staffHelpResponses, shifts, stores, staff, notifications } from '@/lib/db/schema';
import { eq, and, ne, or } from 'drizzle-orm';
import { requireAdmin, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { formatDateForLine, notifyAllManagers, notifyStaff } from '@/lib/line';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// スタッフ応募を確定（要請元の店長/オーナーのみ実行可能）
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);
    const body = await request.json();

    const { responseId } = body;

    if (!responseId) {
      throw ApiErrors.badRequest('応募IDが必要です');
    }

    // ヘルプ要請の存在確認
    const [helpRequest] = await db.select().from(helpRequests).where(eq(helpRequests.id, requestId));
    if (!helpRequest) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    // 要請元の店舗の管理者 or オーナーのみ確定可能
    if (session.role !== 'owner' && session.storeId !== helpRequest.storeId) {
      throw ApiErrors.forbidden();
    }

    if (helpRequest.status === 'confirmed') {
      throw ApiErrors.badRequest('このヘルプ要請は既に確定済みです');
    }

    if (helpRequest.status === 'withdrawn' || helpRequest.status === 'closed') {
      throw ApiErrors.badRequest('このヘルプ要請は確定できません');
    }

    // 応募の存在確認
    const [staffResponse] = await db
      .select()
      .from(staffHelpResponses)
      .where(
        and(
          eq(staffHelpResponses.id, responseId),
          eq(staffHelpResponses.requestId, requestId)
        )
      );

    if (!staffResponse) {
      throw ApiErrors.notFound('スタッフ応募');
    }

    if (staffResponse.status !== 'pending') {
      throw ApiErrors.badRequest('この応募は確定できません');
    }

    // 応募を確定
    await db
      .update(staffHelpResponses)
      .set({ status: 'confirmed' })
      .where(eq(staffHelpResponses.id, responseId));

    // 他のpending応募をrejectedに更新
    await db
      .update(staffHelpResponses)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(staffHelpResponses.requestId, requestId),
          ne(staffHelpResponses.id, responseId),
          eq(staffHelpResponses.status, 'pending')
        )
      );

    // ヘルプ要請のステータスをconfirmedに更新
    await db
      .update(helpRequests)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(helpRequests.id, requestId));

    // シフトレコードを自動作成
    await db.insert(shifts).values({
      staffId: staffResponse.staffId,
      storeId: helpRequest.storeId,
      date: helpRequest.needDate,
      startTime: staffResponse.offerStart,
      endTime: staffResponse.offerEnd,
      isHelpFromOtherStore: true,
    });

    // 店舗名・スタッフ名を取得
    const [requestStore] = await db.select().from(stores).where(eq(stores.id, helpRequest.storeId));
    const [responseStaff] = await db.select().from(staff).where(eq(staff.id, staffResponse.staffId));
    const [staffStore] = responseStaff
      ? await db.select().from(stores).where(eq(stores.id, responseStaff.storeId))
      : [null];

    // 通知（全マネージャー・オーナー + 応募したスタッフ本人）
    const managers = await db
      .select({ id: staff.id })
      .from(staff)
      .where(or(eq(staff.role, 'owner'), eq(staff.role, 'manager')));

    const notifyTargets = [
      ...managers.filter(m => m.id !== session.id),
      { id: staffResponse.staffId },
    ];

    const notificationRecords = notifyTargets.map(m => ({
      userId: m.id,
      type: 'staff_response_confirmed',
      payload: {
        helpRequestId: requestId,
        responseId,
        requestStoreName: requestStore?.name || '',
        staffName: responseStaff?.name || '',
        staffStoreName: staffStore?.name || '',
        needDate: helpRequest.needDate,
        offerStart: staffResponse.offerStart.slice(0, 5),
        offerEnd: staffResponse.offerEnd.slice(0, 5),
      },
    }));

    if (notificationRecords.length > 0) {
      await db.insert(notifications).values(notificationRecords);
    }

    // LINE通知
    const formattedDate = formatDateForLine(helpRequest.needDate);
    const lineMessage = `🟢【確定】${requestStore?.name || ''}の ${formattedDate} ${staffResponse.offerStart.slice(0, 5)}〜${staffResponse.offerEnd.slice(0, 5)} のヘルプが確定しました（${responseStaff?.name || ''}さん応募）\n\nシフトが自動登録されました`;
    await notifyAllManagers(lineMessage);
    // 確定されたスタッフ本人にも通知
    await notifyStaff(staffResponse.staffId, `✅ ${requestStore?.name || ''}のヘルプに確定しました\n${formattedDate} ${staffResponse.offerStart.slice(0, 5)}〜${staffResponse.offerEnd.slice(0, 5)}\nシフトが自動登録されました`);

    return NextResponse.json({
      success: true,
      message: 'スタッフ応募を確定しました',
      responseId,
      requestId,
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/help-requests/[id]/confirm-response');
  }
}
