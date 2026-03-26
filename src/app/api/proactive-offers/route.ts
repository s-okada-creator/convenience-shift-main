import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { proactiveOffers, stores, staff, notifications } from '@/lib/db/schema';
import { eq, and, gte, lte, or } from 'drizzle-orm';
import { getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { formatDateForLine, notifyAllManagers } from '@/lib/line';

const normalizeTime = <T extends { availableStart: string; availableEnd: string }>(row: T) => ({
  ...row,
  availableStart: row.availableStart.slice(0, 5),
  availableEnd: row.availableEnd.slice(0, 5),
});

// 追加勤務希望一覧取得
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

    // スタッフは自分のオファーのみ閲覧可能
    if (session.role === 'staff') {
      conditions.push(eq(proactiveOffers.staffId, session.id));
    }

    if (storeId) {
      conditions.push(eq(proactiveOffers.storeId, parseInt(storeId)));
    }

    if (status) {
      conditions.push(eq(proactiveOffers.status, status));
    }

    if (startDate) {
      conditions.push(gte(proactiveOffers.availableDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(proactiveOffers.availableDate, endDate));
    }

    const query = db
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
      .leftJoin(stores, eq(proactiveOffers.storeId, stores.id));

    const result = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    return NextResponse.json(result.map(normalizeTime));
  } catch (error) {
    return handleApiError(error, 'GET /api/proactive-offers');
  }
}

// 追加勤務希望作成
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const body = await request.json();
    const { staffId, availableDate, availableStart, availableEnd, memo } = body;

    if (!availableDate || !availableStart || !availableEnd) {
      throw ApiErrors.badRequest('必須フィールドが不足しています');
    }

    // 終了時間が開始時間より後かチェック
    if (availableEnd <= availableStart) {
      throw ApiErrors.badRequest('終了時間は開始時間より後にしてください');
    }

    // 過去の日付チェック
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (availableDate < todayStr) {
      throw ApiErrors.badRequest('過去の日付は選択できません');
    }

    let targetStaffId: number;
    let targetStoreId: number;

    if (session.role === 'staff') {
      // スタッフは自分自身のみ
      targetStaffId = session.id;
      if (!session.storeId) {
        throw ApiErrors.badRequest('店舗が設定されていません');
      }
      targetStoreId = session.storeId;
    } else {
      // マネージャー/オーナーは指定のスタッフ
      if (!staffId) {
        throw ApiErrors.badRequest('スタッフを選択してください');
      }
      targetStaffId = staffId;

      const [staffRecord] = await db.select().from(staff).where(eq(staff.id, staffId));
      if (!staffRecord) {
        throw ApiErrors.notFound('スタッフ');
      }

      if (!staffRecord.canWorkOtherStores) {
        throw ApiErrors.badRequest('このスタッフは他店舗勤務が許可されていません');
      }

      // マネージャーは自店スタッフのみ
      if (session.role === 'manager') {
        if (!canAccessStore(session, staffRecord.storeId)) {
          throw ApiErrors.forbidden();
        }
      }

      targetStoreId = staffRecord.storeId;
    }

    // 店舗名・スタッフ名取得
    const [store] = await db.select().from(stores).where(eq(stores.id, targetStoreId));
    const [staffInfo] = await db.select().from(staff).where(eq(staff.id, targetStaffId));

    if (!store || !staffInfo) {
      throw ApiErrors.notFound('店舗またはスタッフ');
    }

    // 追加勤務希望を作成
    const [newOffer] = await db.insert(proactiveOffers).values({
      staffId: targetStaffId,
      storeId: targetStoreId,
      availableDate,
      availableStart,
      availableEnd,
      memo: memo || null,
      status: 'open',
    }).returning();

    // 全マネージャー・オーナーに通知レコードを作成
    const managers = await db
      .select({ id: staff.id })
      .from(staff)
      .where(
        or(eq(staff.role, 'owner'), eq(staff.role, 'manager'))
      );

    const notificationRecords = managers
      .filter((m) => m.id !== session.id)
      .map((m) => ({
        userId: m.id,
        type: 'proactive_offer_created',
        payload: {
          proactiveOfferId: newOffer.id,
          staffName: staffInfo.name,
          storeName: store.name,
          availableDate,
          availableStart,
          availableEnd,
          memo: memo || null,
        },
      }));

    if (notificationRecords.length > 0) {
      await db.insert(notifications).values(notificationRecords);
    }

    // LINE通知
    const formattedDate = formatDateForLine(availableDate);
    const lineMessage = `🟢【追加勤務希望】${staffInfo.name}さん（${store.name}）が ${formattedDate} ${availableStart.slice(0, 5)}〜${availableEnd.slice(0, 5)} 勤務可能です${memo ? ' / ' + memo : ''}`;
    await notifyAllManagers(lineMessage);

    return NextResponse.json(normalizeTime(newOffer), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/proactive-offers');
  }
}
