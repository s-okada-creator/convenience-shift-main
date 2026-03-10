import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { proactiveOffers, stores, staff, shifts, notifications } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { sendDiscordNotification } from '@/lib/discord';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const normalizeTime = <T extends { availableStart: string; availableEnd: string }>(row: T) => ({
  ...row,
  availableStart: row.availableStart.slice(0, 5),
  availableEnd: row.availableEnd.slice(0, 5),
});

// 追加勤務希望詳細取得
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const { id } = await params;
    const offerId = parseInt(id);

    const [offer] = await db
      .select({
        id: proactiveOffers.id,
        staffId: proactiveOffers.staffId,
        staffName: staff.name,
        storeId: proactiveOffers.storeId,
        storeName: stores.name,
        availableDate: proactiveOffers.availableDate,
        availableStart: proactiveOffers.availableStart,
        availableEnd: proactiveOffers.availableEnd,
        memo: proactiveOffers.memo,
        status: proactiveOffers.status,
        acceptedByStoreId: proactiveOffers.acceptedByStoreId,
        acceptedBy: proactiveOffers.acceptedBy,
        createdAt: proactiveOffers.createdAt,
        updatedAt: proactiveOffers.updatedAt,
      })
      .from(proactiveOffers)
      .leftJoin(staff, eq(proactiveOffers.staffId, staff.id))
      .leftJoin(stores, eq(proactiveOffers.storeId, stores.id))
      .where(eq(proactiveOffers.id, offerId));

    if (!offer) {
      throw ApiErrors.notFound('追加勤務希望');
    }

    // スタッフは自分のオファーのみ閲覧可能
    if (session.role === 'staff' && offer.staffId !== session.id) {
      throw ApiErrors.forbidden();
    }

    return NextResponse.json(normalizeTime(offer));
  } catch (error) {
    return handleApiError(error, 'GET /api/proactive-offers/[id]');
  }
}

// 追加勤務希望更新（キャンセル or 受諾）
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const { id } = await params;
    const offerId = parseInt(id);
    const body = await request.json();

    const [existing] = await db.select().from(proactiveOffers).where(eq(proactiveOffers.id, offerId));
    if (!existing) {
      throw ApiErrors.notFound('追加勤務希望');
    }

    const { action } = body; // 'cancel' or 'accept'

    if (action === 'cancel') {
      // キャンセル: 投稿者本人またはそのマネージャー
      if (session.role === 'staff') {
        if (existing.staffId !== session.id) {
          throw ApiErrors.forbidden();
        }
      } else if (session.role === 'manager') {
        if (!canAccessStore(session, existing.storeId)) {
          throw ApiErrors.forbidden();
        }
      }
      // オーナーは全件キャンセル可能

      if (existing.status !== 'open') {
        throw ApiErrors.badRequest('この勤務希望はキャンセルできません');
      }

      const [updated] = await db
        .update(proactiveOffers)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(proactiveOffers.id, offerId))
        .returning();

      return NextResponse.json(normalizeTime(updated));
    }

    if (action === 'accept') {
      // 受諾: マネージャーまたはオーナーのみ
      if (session.role === 'staff') {
        throw ApiErrors.forbidden();
      }

      if (existing.status !== 'open') {
        throw ApiErrors.badRequest('この勤務希望は既に処理済みです');
      }

      // 受諾する店舗ID（マネージャーは自店、オーナーはbodyから取得）
      const acceptingStoreId = session.role === 'owner'
        ? (body.acceptingStoreId || null)
        : session.storeId;

      if (!acceptingStoreId) {
        throw ApiErrors.badRequest('受入れ店舗を指定してください');
      }

      // ステータス更新
      const [updated] = await db
        .update(proactiveOffers)
        .set({
          status: 'accepted',
          acceptedByStoreId: acceptingStoreId,
          acceptedBy: session.id,
          updatedAt: new Date(),
        })
        .where(eq(proactiveOffers.id, offerId))
        .returning();

      // シフトレコードを自動作成
      await db.insert(shifts).values({
        staffId: existing.staffId,
        storeId: acceptingStoreId,
        date: existing.availableDate,
        startTime: existing.availableStart,
        endTime: existing.availableEnd,
        isHelpFromOtherStore: true,
      });

      // 店舗名・スタッフ名を取得
      const [staffInfo] = await db.select().from(staff).where(eq(staff.id, existing.staffId));
      const [acceptingStore] = await db.select().from(stores).where(eq(stores.id, acceptingStoreId));

      // 通知レコードを作成
      const managers = await db
        .select({ id: staff.id })
        .from(staff)
        .where(or(eq(staff.role, 'owner'), eq(staff.role, 'manager')));

      const notificationRecords = managers
        .filter((m) => m.id !== session.id)
        .map((m) => ({
          userId: m.id,
          type: 'proactive_offer_accepted',
          payload: {
            proactiveOfferId: offerId,
            staffName: staffInfo?.name || '',
            acceptingStoreName: acceptingStore?.name || '',
            availableDate: existing.availableDate,
            availableStart: existing.availableStart,
            availableEnd: existing.availableEnd,
          },
        }));

      // 投稿者本人にも通知
      notificationRecords.push({
        userId: existing.staffId,
        type: 'proactive_offer_accepted',
        payload: {
          proactiveOfferId: offerId,
          staffName: staffInfo?.name || '',
          acceptingStoreName: acceptingStore?.name || '',
          availableDate: existing.availableDate,
          availableStart: existing.availableStart,
          availableEnd: existing.availableEnd,
        },
      });

      if (notificationRecords.length > 0) {
        await db.insert(notifications).values(notificationRecords);
      }

      // Discord通知
      const [year, month, day] = existing.availableDate.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      const formattedDate = `${parseInt(month)}/${parseInt(day)}（${weekdays[dateObj.getDay()]}）`;

      const discordMessage = `【勤務確定】${staffInfo?.name || ''}さんが${acceptingStore?.name || ''}で ${formattedDate} ${existing.availableStart.slice(0, 5)}〜${existing.availableEnd.slice(0, 5)} 勤務確定`;
      await sendDiscordNotification(discordMessage);

      return NextResponse.json(normalizeTime(updated));
    }

    throw ApiErrors.badRequest('不正なアクションです');
  } catch (error) {
    return handleApiError(error, 'PUT /api/proactive-offers/[id]');
  }
}

// 追加勤務希望削除
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const { id } = await params;
    const offerId = parseInt(id);

    const [existing] = await db.select().from(proactiveOffers).where(eq(proactiveOffers.id, offerId));
    if (!existing) {
      throw ApiErrors.notFound('追加勤務希望');
    }

    // キャンセル権限チェック
    if (session.role === 'staff') {
      if (existing.staffId !== session.id) {
        throw ApiErrors.forbidden();
      }
    } else if (session.role === 'manager') {
      if (!canAccessStore(session, existing.storeId)) {
        throw ApiErrors.forbidden();
      }
    }
    // オーナーは全件削除可能

    // accepted状態は削除不可
    if (existing.status === 'accepted') {
      throw ApiErrors.badRequest('確定済みの勤務希望は削除できません');
    }

    await db.delete(proactiveOffers).where(eq(proactiveOffers.id, offerId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/proactive-offers/[id]');
  }
}
