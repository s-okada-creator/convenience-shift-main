import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, helpOffers, stores, staff } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { formatDateForLine, notifyStoreManagers, APP_URL } from '@/lib/line';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ヘルプ要請に対するオファー一覧取得
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);

    // ヘルプ要請の存在確認
    const [helpRequest] = await db.select().from(helpRequests).where(eq(helpRequests.id, requestId));
    if (!helpRequest) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    const offers = await db
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

    const normalizedOffers = offers.map((o) => ({
      ...o,
      offerStart: o.offerStart.slice(0, 5),
      offerEnd: o.offerEnd.slice(0, 5),
    }));

    return NextResponse.json(normalizedOffers);
  } catch (error) {
    return handleApiError(error, 'GET /api/help-requests/[id]/offers');
  }
}

// ヘルプ要請に対するオファー作成（店長が自店舗スタッフを提供）
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);
    const body = await request.json();

    const { staffId, offerStart, offerEnd, isPartial } = body;

    if (!staffId || !offerStart || !offerEnd) {
      throw ApiErrors.badRequest('必須フィールドが不足しています');
    }

    // ヘルプ要請の存在・ステータス確認
    const [helpRequest] = await db.select().from(helpRequests).where(eq(helpRequests.id, requestId));
    if (!helpRequest) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    if (helpRequest.status !== 'open' && helpRequest.status !== 'offered') {
      throw ApiErrors.badRequest('このヘルプ要請にはオファーできません');
    }

    // オファーするスタッフの存在確認と自店舗チェック
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));
    if (!staffMember) {
      throw ApiErrors.notFound('スタッフ');
    }

    // マネージャーは自店舗のスタッフのみオファー可能
    if (!canAccessStore(session, staffMember.storeId)) {
      throw ApiErrors.forbidden();
    }

    // オファー元の店舗IDを決定
    const offeringStoreId = session.role === 'owner' ? staffMember.storeId : session.storeId!;

    // 自店舗へのヘルプにはオファー不要（自店舗の要請には自店舗からオファーできない）
    if (offeringStoreId === helpRequest.storeId) {
      throw ApiErrors.badRequest('自店舗のヘルプ要請にはオファーできません');
    }

    const [newOffer] = await db.insert(helpOffers).values({
      requestId,
      offeringStoreId,
      staffId,
      offeredBy: session.id,
      offerStart,
      offerEnd,
      isPartial: isPartial || false,
      status: 'pending',
    }).returning();

    // ヘルプ要請のステータスをofferedに更新
    if (helpRequest.status === 'open') {
      await db
        .update(helpRequests)
        .set({ status: 'offered', updatedAt: new Date() })
        .where(eq(helpRequests.id, requestId));
    }

    // LINE通知
    const [offeringStore] = await db.select().from(stores).where(eq(stores.id, offeringStoreId));
    const [requestingStore] = await db.select().from(stores).where(eq(stores.id, helpRequest.storeId));
    const formattedDate = formatDateForLine(helpRequest.needDate);
    const lineMessage = [
      `🤝 他店からスタッフの申し出があります`,
      ``,
      `📍 ${requestingStore?.name || ''}のヘルプ要請`,
      `📅 ${formattedDate} ${offerStart.slice(0, 5)}〜${offerEnd.slice(0, 5)}`,
      `👤 @${staffMember.name}さん（${offeringStore?.name || ''}）が対応可能`,
      isPartial ? `⚠️ 部分対応` : `✅ フル対応`,
      ``,
      `👇 確認して確定してください`,
      `🔗 ${APP_URL}/dashboard/help-board/${requestId}`,
    ].filter(Boolean).join('\n');
    await notifyStoreManagers(helpRequest.storeId, lineMessage);

    return NextResponse.json({
      ...newOffer,
      offerStart: newOffer.offerStart.slice(0, 5),
      offerEnd: newOffer.offerEnd.slice(0, 5),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/help-requests/[id]/offers');
  }
}
