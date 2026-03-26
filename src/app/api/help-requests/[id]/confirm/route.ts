import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, helpOffers, shifts, stores, staff, notifications } from '@/lib/db/schema';
import { eq, and, ne, or } from 'drizzle-orm';
import { requireAdmin, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { sendDiscordNotification, sendStoreDiscordNotification, formatDateForDiscord } from '@/lib/discord';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// オファー確定（要請元の店長のみ実行可能）
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);
    const body = await request.json();

    const { offerId } = body;

    if (!offerId) {
      throw ApiErrors.badRequest('オファーIDが必要です');
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

    // オファーの存在確認
    const [offer] = await db.select().from(helpOffers).where(
      and(eq(helpOffers.id, offerId), eq(helpOffers.requestId, requestId))
    );
    if (!offer) {
      throw ApiErrors.notFound('オファー');
    }

    if (offer.status !== 'pending') {
      throw ApiErrors.badRequest('このオファーは確定できません');
    }

    // オファーを確定
    await db
      .update(helpOffers)
      .set({ status: 'confirmed' })
      .where(eq(helpOffers.id, offerId));

    // 他のpendingオファーをrejectedに更新
    await db
      .update(helpOffers)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(helpOffers.requestId, requestId),
          ne(helpOffers.id, offerId),
          eq(helpOffers.status, 'pending')
        )
      );

    // ヘルプ要請のステータスをconfirmedに更新
    await db
      .update(helpRequests)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(helpRequests.id, requestId));

    // シフトレコードを自動作成（isHelpFromOtherStore=true）
    await db.insert(shifts).values({
      staffId: offer.staffId,
      storeId: helpRequest.storeId, // ヘルプ先（要請元）の店舗
      date: helpRequest.needDate,
      startTime: offer.offerStart,
      endTime: offer.offerEnd,
      isHelpFromOtherStore: true,
    });

    // 店舗名・スタッフ名を取得して通知
    const [requestStore] = await db.select().from(stores).where(eq(stores.id, helpRequest.storeId));
    const [offerStore] = await db.select().from(stores).where(eq(stores.id, offer.offeringStoreId));
    const [offerStaff] = await db.select().from(staff).where(eq(staff.id, offer.staffId));

    // 全マネージャー・オーナーに通知レコード作成
    const managers = await db
      .select({ id: staff.id })
      .from(staff)
      .where(or(eq(staff.role, 'owner'), eq(staff.role, 'manager')));

    const notificationRecords = managers
      .filter((m) => m.id !== session.id)
      .map((m) => ({
        userId: m.id,
        type: 'help_offer_confirmed',
        payload: {
          helpRequestId: requestId,
          offerId,
          requestStoreName: requestStore?.name || '',
          offerStoreName: offerStore?.name || '',
          staffName: offerStaff?.name || '',
          needDate: helpRequest.needDate,
          offerStart: offer.offerStart.slice(0, 5),
          offerEnd: offer.offerEnd.slice(0, 5),
        },
      }));

    if (notificationRecords.length > 0) {
      await db.insert(notifications).values(notificationRecords);
    }

    // Discord通知
    const formattedDate = formatDateForDiscord(helpRequest.needDate);
    const discordMessage = `🟢【確定】${requestStore?.name || ''}の ${formattedDate} ${offer.offerStart.slice(0, 5)}〜${offer.offerEnd.slice(0, 5)} のヘルプが確定しました（${offerStaff?.name || ''}さん / ${offerStore?.name || ''}）`;
    // 全体チャンネル
    await sendDiscordNotification(discordMessage);
    // 要請元の店舗チャンネル
    await sendStoreDiscordNotification(helpRequest.storeId, `✅ ${discordMessage}\n\nシフトが自動登録されました`);
    // オファー元の店舗チャンネル
    if (offer.offeringStoreId !== helpRequest.storeId) {
      await sendStoreDiscordNotification(offer.offeringStoreId, `✅ ${offerStaff?.name || ''}さんが${requestStore?.name || ''}のヘルプに確定しました（${formattedDate} ${offer.offerStart.slice(0, 5)}〜${offer.offerEnd.slice(0, 5)}）`);
    }

    return NextResponse.json({
      success: true,
      message: 'オファーを確定しました',
      offerId,
      requestId,
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/help-requests/[id]/confirm');
  }
}
