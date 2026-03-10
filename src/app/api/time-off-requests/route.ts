import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeOffRequests, staff } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { getSession, canAccessStore } from '@/lib/auth';

// 休み希望一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');
    const staffId = searchParams.get('staffId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');

    // スタッフの場合は自分のみ取得可能
    if (session.role === 'staff') {
      const requests = await db
        .select({
          id: timeOffRequests.id,
          staffId: timeOffRequests.staffId,
          date: timeOffRequests.date,
          status: timeOffRequests.status,
          createdAt: timeOffRequests.createdAt,
          reason: timeOffRequests.reason,
          staffName: staff.name,
          staffStoreId: staff.storeId,
        })
        .from(timeOffRequests)
        .leftJoin(staff, eq(timeOffRequests.staffId, staff.id))
        .where(eq(timeOffRequests.staffId, session.id));

      return NextResponse.json(requests);
    }

    // 管理者の場合
    const conditions: ReturnType<typeof eq>[] = [];

    if (storeId) {
      const storeIdNum = parseInt(storeId);
      if (!canAccessStore(session, storeIdNum)) {
        return NextResponse.json({ error: 'この店舗へのアクセス権限がありません' }, { status: 403 });
      }
      // 指定店舗のスタッフのみ取得
      const storeStaff = await db.select({ id: staff.id }).from(staff).where(eq(staff.storeId, storeIdNum));
      const staffIds = storeStaff.map((s) => s.id);
      if (staffIds.length > 0) {
        conditions.push(inArray(timeOffRequests.staffId, staffIds));
      } else {
        return NextResponse.json([]);
      }
    } else if (session.role === 'manager' && session.storeId) {
      // 店長は自店舗のみ
      const storeStaff = await db.select({ id: staff.id }).from(staff).where(eq(staff.storeId, session.storeId));
      const staffIds = storeStaff.map((s) => s.id);
      if (staffIds.length > 0) {
        conditions.push(inArray(timeOffRequests.staffId, staffIds));
      } else {
        return NextResponse.json([]);
      }
    }

    if (staffId) {
      conditions.push(eq(timeOffRequests.staffId, parseInt(staffId)));
    }

    if (startDate) {
      conditions.push(gte(timeOffRequests.date, startDate));
    }

    if (endDate) {
      conditions.push(lte(timeOffRequests.date, endDate));
    }

    if (status) {
      conditions.push(eq(timeOffRequests.status, status as 'pending' | 'approved' | 'rejected'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const requests = await db
      .select({
        id: timeOffRequests.id,
        staffId: timeOffRequests.staffId,
        date: timeOffRequests.date,
        status: timeOffRequests.status,
        createdAt: timeOffRequests.createdAt,
        reason: timeOffRequests.reason,
        staffName: staff.name,
        staffStoreId: staff.storeId,
      })
      .from(timeOffRequests)
      .leftJoin(staff, eq(timeOffRequests.staffId, staff.id))
      .where(whereClause);

    return NextResponse.json(requests);
  } catch (error) {
    console.error('休み希望一覧取得エラー:', error);
    return NextResponse.json({ error: '休み希望一覧の取得に失敗しました' }, { status: 500 });
  }
}

// 休み希望作成
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { staffId, dates, reason } = body;

    // スタッフは自分のみ。管理者も未指定なら自分に紐づける
    const targetStaffId = session.role === 'staff'
      ? session.id
      : (staffId ?? session.id);

    if (!targetStaffId) {
      return NextResponse.json({ error: 'スタッフIDが必要です' }, { status: 400 });
    }

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: '日付が必要です' }, { status: 400 });
    }

    // スタッフの存在確認と権限チェック
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, targetStaffId));
    if (!staffMember) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 });
    }

    // 管理者が他人の休み希望を作成する場合は店舗権限チェック
    if (session.role !== 'staff' && targetStaffId !== session.id) {
      if (!canAccessStore(session, staffMember.storeId)) {
        return NextResponse.json({ error: 'このスタッフへのアクセス権限がありません' }, { status: 403 });
      }
    }

    // 重複チェック
    const existingRequests = await db
      .select()
      .from(timeOffRequests)
      .where(
        and(
          eq(timeOffRequests.staffId, targetStaffId),
          inArray(timeOffRequests.date, dates)
        )
      );

    const existingDates = existingRequests.map((r) => r.date);
    const newDates = dates.filter((d: string) => !existingDates.includes(d));

    if (newDates.length === 0) {
      return NextResponse.json({ error: '指定された日付はすでに休み希望が登録されています' }, { status: 400 });
    }

    // 休み希望を作成
    const newRequests = newDates.map((date: string) => ({
      staffId: targetStaffId,
      date,
      status: 'pending' as const,
      reason: typeof reason === 'string' ? reason.trim() || null : null,
    }));

    await db.insert(timeOffRequests).values(newRequests);

    // 作成された休み希望を取得
    const createdRequests = await db
      .select()
      .from(timeOffRequests)
      .where(
        and(
          eq(timeOffRequests.staffId, targetStaffId),
          inArray(timeOffRequests.date, newDates)
        )
      );

    return NextResponse.json(createdRequests, { status: 201 });
  } catch (error) {
    console.error('休み希望作成エラー:', error);
    return NextResponse.json({ error: '休み希望の作成に失敗しました' }, { status: 500 });
  }
}
