import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, helpOffers, staffHelpResponses, stores, staff, notifications } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { formatDateForLine, notifyAllManagers } from '@/lib/line';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const normalizeTime = <T extends { needStart: string; needEnd: string }>(row: T) => ({
  ...row,
  needStart: row.needStart.slice(0, 5),
  needEnd: row.needEnd.slice(0, 5),
});

// ヘルプ要請詳細取得（オファー付き）
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const { id } = await params;
    const requestId = parseInt(id);

    const [helpRequest] = await db
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
      .leftJoin(staff, eq(helpRequests.requestedBy, staff.id))
      .where(eq(helpRequests.id, requestId));

    if (!helpRequest) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    // オファー一覧取得
    const offerStaff = db
      .select({
        id: helpOffers.id,
        requestId: helpOffers.requestId,
        offeringStoreId: helpOffers.offeringStoreId,
        offeringStoreName: stores.name,
        staffId: helpOffers.staffId,
        staffName: staff.name,
        offeredBy: helpOffers.offeredBy,
        offerStart: helpOffers.offerStart,
        offerEnd: helpOffers.offerEnd,
        isPartial: helpOffers.isPartial,
        status: helpOffers.status,
        createdAt: helpOffers.createdAt,
      })
      .from(helpOffers)
      .leftJoin(stores, eq(helpOffers.offeringStoreId, stores.id))
      .leftJoin(staff, eq(helpOffers.staffId, staff.id))
      .where(eq(helpOffers.requestId, requestId));

    const offers = await offerStaff;

    // スタッフ直接応答一覧取得
    const staffResponses = await db
      .select({
        id: staffHelpResponses.id,
        requestId: staffHelpResponses.requestId,
        staffId: staffHelpResponses.staffId,
        staffName: staff.name,
        offerStart: staffHelpResponses.offerStart,
        offerEnd: staffHelpResponses.offerEnd,
        isPartial: staffHelpResponses.isPartial,
        message: staffHelpResponses.message,
        status: staffHelpResponses.status,
        createdAt: staffHelpResponses.createdAt,
      })
      .from(staffHelpResponses)
      .leftJoin(staff, eq(staffHelpResponses.staffId, staff.id))
      .where(eq(staffHelpResponses.requestId, requestId));

    const normalizedOffers = offers.map((o) => ({
      ...o,
      offerStart: o.offerStart.slice(0, 5),
      offerEnd: o.offerEnd.slice(0, 5),
    }));

    const normalizedStaffResponses = staffResponses.map((r) => ({
      ...r,
      offerStart: r.offerStart.slice(0, 5),
      offerEnd: r.offerEnd.slice(0, 5),
    }));

    return NextResponse.json({
      ...normalizeTime(helpRequest),
      offers: normalizedOffers,
      staffResponses: normalizedStaffResponses,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/help-requests/[id]');
  }
}

// ヘルプ要請更新（ステータス・メモ変更、取り下げ対応）
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);
    const body = await request.json();

    const [existing] = await db.select().from(helpRequests).where(eq(helpRequests.id, requestId));
    if (!existing) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    // 自店舗のヘルプ要請のみ更新可能
    if (!canAccessStore(session, existing.storeId)) {
      throw ApiErrors.forbidden();
    }

    const { status, memo, staffNotified } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (status !== undefined) updateData.status = status;
    if (memo !== undefined) updateData.memo = memo;
    if (staffNotified !== undefined) updateData.staffNotified = staffNotified;

    const [updated] = await db
      .update(helpRequests)
      .set(updateData)
      .where(eq(helpRequests.id, requestId))
      .returning();

    // 取り下げの場合、通知を送信
    if (status === 'withdrawn') {
      const [store] = await db.select().from(stores).where(eq(stores.id, existing.storeId));

      // 全マネージャー・オーナーに通知
      const managers = await db
        .select({ id: staff.id })
        .from(staff)
        .where(or(eq(staff.role, 'owner'), eq(staff.role, 'manager')));

      const notificationRecords = managers
        .filter((m) => m.id !== session.id)
        .map((m) => ({
          userId: m.id,
          type: 'help_request_withdrawn',
          payload: {
            helpRequestId: requestId,
            storeId: existing.storeId,
            storeName: store?.name || '',
            needDate: existing.needDate,
          },
        }));

      if (notificationRecords.length > 0) {
        await db.insert(notifications).values(notificationRecords);
      }

      // LINE通知
      const formattedDate = formatDateForLine(existing.needDate);
      const lineMessage = `⚪【取り下げ】${store?.name || ''}の ${formattedDate} ${existing.needStart.slice(0, 5)}〜${existing.needEnd.slice(0, 5)} のヘルプ要請が取り下げられました`;
      await notifyAllManagers(lineMessage);
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'PUT /api/help-requests/[id]');
  }
}

// ヘルプ要請削除
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);

    const [existing] = await db.select().from(helpRequests).where(eq(helpRequests.id, requestId));
    if (!existing) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    if (!canAccessStore(session, existing.storeId)) {
      throw ApiErrors.forbidden();
    }

    // confirmed状態の要請は削除不可
    if (existing.status === 'confirmed') {
      throw ApiErrors.badRequest('確定済みのヘルプ要請は削除できません');
    }

    await db.delete(helpRequests).where(eq(helpRequests.id, requestId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/help-requests/[id]');
  }
}
