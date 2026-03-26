import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shiftPostings, shiftApplications, stores, staff } from '@/lib/db/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';

const normalizeTime = <T extends { startTime: string; endTime: string }>(row: T) => ({
  ...row,
  startTime: row.startTime.slice(0, 5),
  endTime: row.endTime.slice(0, 5),
});

// シフト求人一覧取得
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

    if (storeId) {
      const storeIdNum = parseInt(storeId);
      conditions.push(eq(shiftPostings.storeId, storeIdNum));
    }

    if (status) {
      conditions.push(eq(shiftPostings.status, status as 'open' | 'filled' | 'closed' | 'expired'));
    }
    if (startDate) {
      conditions.push(gte(shiftPostings.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(shiftPostings.date, endDate));
    }

    // 応募数サブクエリ
    const applicationCountSubquery = db
      .select({
        postingId: shiftApplications.postingId,
        count: sql<number>`count(*)`.as('application_count'),
      })
      .from(shiftApplications)
      .groupBy(shiftApplications.postingId)
      .as('app_count');

    const query = db
      .select({
        id: shiftPostings.id,
        storeId: shiftPostings.storeId,
        storeName: stores.name,
        postedBy: shiftPostings.postedBy,
        postedByName: staff.name,
        date: shiftPostings.date,
        startTime: shiftPostings.startTime,
        endTime: shiftPostings.endTime,
        slots: shiftPostings.slots,
        filledCount: shiftPostings.filledCount,
        description: shiftPostings.description,
        status: shiftPostings.status,
        applicationCount: sql<number>`coalesce(${applicationCountSubquery.count}, 0)`.mapWith(Number),
        createdAt: shiftPostings.createdAt,
        updatedAt: shiftPostings.updatedAt,
      })
      .from(shiftPostings)
      .leftJoin(stores, eq(shiftPostings.storeId, stores.id))
      .leftJoin(staff, eq(shiftPostings.postedBy, staff.id))
      .leftJoin(applicationCountSubquery, eq(shiftPostings.id, applicationCountSubquery.postingId))
      .orderBy(desc(shiftPostings.date));

    const result = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    return NextResponse.json(result.map(normalizeTime));
  } catch (error) {
    return handleApiError(error, 'GET /api/shift-postings');
  }
}

// シフト求人作成
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    const { storeId, date, startTime, endTime, slots, description } = body;

    if (!date || !startTime || !endTime) {
      throw ApiErrors.badRequest('必須フィールドが不足しています（date, startTime, endTime）');
    }

    // 店舗IDはセッションから（ownerの場合はbodyから）
    const targetStoreId = session.role === 'owner' ? (storeId || session.storeId) : session.storeId;
    if (!targetStoreId) {
      throw ApiErrors.badRequest('店舗IDが必要です');
    }

    if (!canAccessStore(session, targetStoreId)) {
      throw ApiErrors.forbidden();
    }

    // 店舗存在確認
    const [store] = await db.select().from(stores).where(eq(stores.id, targetStoreId));
    if (!store) {
      throw ApiErrors.badRequest(`店舗(ID=${targetStoreId})が見つかりません`);
    }

    // postedByのスタッフ存在確認
    const [poster] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, session.id));
    if (!poster) {
      throw ApiErrors.badRequest(`スタッフ(ID=${session.id})が見つかりません。再ログインしてください。`);
    }

    const [newPosting] = await db.insert(shiftPostings).values({
      storeId: targetStoreId,
      postedBy: session.id,
      date,
      startTime,
      endTime,
      slots: slots || 1,
      description: description || null,
      status: 'open',
    }).returning();

    return NextResponse.json(normalizeTime(newPosting), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/shift-postings');
  }
}
