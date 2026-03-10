import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shifts, staff } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';

const normalizeShiftTime = <T extends { startTime: string; endTime: string }>(shift: T) => ({
  ...shift,
  startTime: shift.startTime.slice(0, 5),
  endTime: shift.endTime.slice(0, 5),
});

// シフト一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const staffId = searchParams.get('staffId');

    if (!storeId) {
      throw ApiErrors.badRequest('店舗IDが必要です');
    }

    const storeIdNum = parseInt(storeId);

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, storeIdNum)) {
      throw ApiErrors.forbidden();
    }

    // 条件を構築
    const conditions = [eq(shifts.storeId, storeIdNum)];

    if (startDate) {
      conditions.push(gte(shifts.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(shifts.date, endDate));
    }
    if (staffId) {
      conditions.push(eq(shifts.staffId, parseInt(staffId)));
    }

    const shiftList = await db
      .select({
        id: shifts.id,
        staffId: shifts.staffId,
        storeId: shifts.storeId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        isHelpFromOtherStore: shifts.isHelpFromOtherStore,
        createdAt: shifts.createdAt,
        staffName: staff.name,
        staffRole: staff.role,
        staffEmploymentType: staff.employmentType,
      })
      .from(shifts)
      .leftJoin(staff, eq(shifts.staffId, staff.id))
      .where(and(...conditions));

    return NextResponse.json(shiftList.map(normalizeShiftTime));
  } catch (error) {
    return handleApiError(error, 'GET /api/shifts');
  }
}

// シフト作成
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    const { staffId, storeId, date, startTime, endTime, isHelpFromOtherStore } = body;

    // 必須フィールドチェック
    if (!staffId || !storeId || !date || !startTime || !endTime) {
      throw ApiErrors.badRequest('必須フィールドが不足しています');
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, storeId)) {
      throw ApiErrors.forbidden();
    }

    // スタッフの存在確認
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));
    if (!staffMember) {
      throw ApiErrors.notFound('スタッフ');
    }

    const [newShift] = await db.insert(shifts).values({
      staffId,
      storeId,
      date,
      startTime,
      endTime,
      isHelpFromOtherStore: isHelpFromOtherStore || false,
    }).returning();

    return NextResponse.json(normalizeShiftTime(newShift), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/shifts');
  }
}

// シフト一括作成・更新
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    const { storeId, date, shifts: shiftData } = body;

    if (!storeId || !date || !Array.isArray(shiftData)) {
      throw ApiErrors.badRequest('必須フィールドが不足しています');
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, storeId)) {
      throw ApiErrors.forbidden();
    }

    // 該当日のシフトを削除
    await db.delete(shifts).where(
      and(
        eq(shifts.storeId, storeId),
        eq(shifts.date, date)
      )
    );

    // 新しいシフトを挿入
    if (shiftData.length > 0) {
      const newShifts = shiftData.map((s: { staffId: number; startTime: string; endTime: string; isHelpFromOtherStore?: boolean }) => ({
        staffId: s.staffId,
        storeId,
        date,
        startTime: s.startTime,
        endTime: s.endTime,
        isHelpFromOtherStore: s.isHelpFromOtherStore || false,
      }));

      await db.insert(shifts).values(newShifts);
    }

    // 更新後のシフトを取得
    const updatedShifts = await db
      .select({
        id: shifts.id,
        staffId: shifts.staffId,
        storeId: shifts.storeId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        isHelpFromOtherStore: shifts.isHelpFromOtherStore,
        createdAt: shifts.createdAt,
        staffName: staff.name,
        staffRole: staff.role,
        staffEmploymentType: staff.employmentType,
      })
      .from(shifts)
      .leftJoin(staff, eq(shifts.staffId, staff.id))
      .where(and(eq(shifts.storeId, storeId), eq(shifts.date, date)));

    return NextResponse.json(updatedShifts.map(normalizeShiftTime));
  } catch (error) {
    return handleApiError(error, 'PUT /api/shifts');
  }
}
