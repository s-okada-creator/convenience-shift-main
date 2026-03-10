import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shifts, staff } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';

const normalizeShiftTime = <T extends { startTime: string; endTime: string }>(shift: T) => ({
  ...shift,
  startTime: shift.startTime.slice(0, 5),
  endTime: shift.endTime.slice(0, 5),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// シフト詳細取得
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { id } = await params;
    const shiftId = parseInt(id);

    const [shift] = await db
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
      .where(eq(shifts.id, shiftId));

    if (!shift) {
      return NextResponse.json({ error: 'シフトが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, shift.storeId)) {
      return NextResponse.json({ error: 'このシフトへのアクセス権限がありません' }, { status: 403 });
    }

    return NextResponse.json(normalizeShiftTime(shift));
  } catch (error) {
    console.error('シフト詳細取得エラー:', error);
    return NextResponse.json({ error: 'シフト詳細の取得に失敗しました' }, { status: 500 });
  }
}

// シフト更新
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const shiftId = parseInt(id);
    const body = await request.json();

    // 既存シフト確認
    const [existingShift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));

    if (!existingShift) {
      return NextResponse.json({ error: 'シフトが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, existingShift.storeId)) {
      return NextResponse.json({ error: 'このシフトへのアクセス権限がありません' }, { status: 403 });
    }

    const { staffId, date, startTime, endTime, isHelpFromOtherStore } = body;

    const [updatedShift] = await db.update(shifts)
      .set({
        staffId: staffId ?? existingShift.staffId,
        date: date ?? existingShift.date,
        startTime: startTime ?? existingShift.startTime,
        endTime: endTime ?? existingShift.endTime,
        isHelpFromOtherStore: isHelpFromOtherStore ?? existingShift.isHelpFromOtherStore,
      })
      .where(eq(shifts.id, shiftId))
      .returning();

    return NextResponse.json(normalizeShiftTime(updatedShift));
  } catch (error) {
    console.error('シフト更新エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'シフトの更新に失敗しました' }, { status: 500 });
  }
}

// シフト削除
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const shiftId = parseInt(id);

    // 既存シフト確認
    const [existingShift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));

    if (!existingShift) {
      return NextResponse.json({ error: 'シフトが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, existingShift.storeId)) {
      return NextResponse.json({ error: 'このシフトへのアクセス権限がありません' }, { status: 403 });
    }

    await db.delete(shifts).where(eq(shifts.id, shiftId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('シフト削除エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'シフトの削除に失敗しました' }, { status: 500 });
  }
}
