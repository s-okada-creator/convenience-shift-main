import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shifts, staff, stores, timeOffRequests } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

const normalizeShiftTime = <T extends { startTime: string; endTime: string }>(shift: T) => ({
  ...shift,
  startTime: shift.startTime.slice(0, 5),
  endTime: shift.endTime.slice(0, 5),
});

// 自分のシフト一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 条件を構築
    const conditions = [eq(shifts.staffId, session.id)];

    if (startDate) {
      conditions.push(gte(shifts.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(shifts.date, endDate));
    }

    // シフト一覧を取得
    const myShifts = await db
      .select({
        id: shifts.id,
        staffId: shifts.staffId,
        storeId: shifts.storeId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        isHelpFromOtherStore: shifts.isHelpFromOtherStore,
        createdAt: shifts.createdAt,
        storeName: stores.name,
      })
      .from(shifts)
      .leftJoin(stores, eq(shifts.storeId, stores.id))
      .where(and(...conditions))
      .orderBy(shifts.date, shifts.startTime);

    // 休み希望も取得（同じ期間）
    const timeOffConditions = [eq(timeOffRequests.staffId, session.id)];
    if (startDate) {
      timeOffConditions.push(gte(timeOffRequests.date, startDate));
    }
    if (endDate) {
      timeOffConditions.push(lte(timeOffRequests.date, endDate));
    }

    const myTimeOffRequests = await db
      .select()
      .from(timeOffRequests)
      .where(and(...timeOffConditions));

    // スタッフ情報を取得（勤務時間計算用）
    const [staffInfo] = await db
      .select({
        id: staff.id,
        name: staff.name,
        hourlyRate: staff.hourlyRate,
        storeId: staff.storeId,
        storeName: stores.name,
      })
      .from(staff)
      .leftJoin(stores, eq(staff.storeId, stores.id))
      .where(eq(staff.id, session.id));

    return NextResponse.json({
      shifts: myShifts.map(normalizeShiftTime),
      timeOffRequests: myTimeOffRequests,
      staffInfo,
    });
  } catch (error) {
    console.error('マイシフト取得エラー:', error);
    return NextResponse.json({ error: 'マイシフトの取得に失敗しました' }, { status: 500 });
  }
}
