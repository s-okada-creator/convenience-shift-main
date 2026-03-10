import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { staff, availabilityPatterns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// スタッフ詳細取得
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { id } = await params;
    const staffId = parseInt(id);

    const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));

    if (!staffMember) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, staffMember.storeId)) {
      return NextResponse.json({ error: 'このスタッフへのアクセス権限がありません' }, { status: 403 });
    }

    // 勤務可能時間パターンも取得
    const patterns = await db.select().from(availabilityPatterns).where(eq(availabilityPatterns.staffId, staffId));
    const normalizedPatterns = patterns.map((pattern) => ({
      ...pattern,
      startTime: pattern.startTime.slice(0, 5),
      endTime: pattern.endTime.slice(0, 5),
    }));

    return NextResponse.json({
      ...staffMember,
      availabilityPatterns: normalizedPatterns,
    });
  } catch (error) {
    console.error('スタッフ詳細取得エラー:', error);
    return NextResponse.json({ error: 'スタッフ詳細の取得に失敗しました' }, { status: 500 });
  }
}

// スタッフ更新
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const staffId = parseInt(id);
    const body = await request.json();

    // 既存スタッフ確認
    const [existingStaff] = await db.select().from(staff).where(eq(staff.id, staffId));

    if (!existingStaff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, existingStaff.storeId)) {
      return NextResponse.json({ error: 'このスタッフへのアクセス権限がありません' }, { status: 403 });
    }

    // オーナー・店長への変更はオーナーのみ
    if ((body.role === 'owner' || body.role === 'manager') && session.role !== 'owner') {
      return NextResponse.json({ error: 'オーナー・店長への変更にはオーナー権限が必要です' }, { status: 403 });
    }

    const { name, email, phone, employmentType, hourlyRate, joinedAt, skillLevel, notes, role, storeId } = body;

    // 店舗変更時の権限チェック
    if (storeId && storeId !== existingStaff.storeId) {
      if (!canAccessStore(session, storeId)) {
        return NextResponse.json({ error: '移動先店舗へのアクセス権限がありません' }, { status: 403 });
      }
    }

    const [updatedStaff] = await db.update(staff)
      .set({
        name: name ?? existingStaff.name,
        email: email !== undefined ? email : existingStaff.email,
        phone: phone !== undefined ? phone : existingStaff.phone,
        employmentType: employmentType ?? existingStaff.employmentType,
        hourlyRate: hourlyRate ?? existingStaff.hourlyRate,
        joinedAt: joinedAt ?? existingStaff.joinedAt,
        skillLevel: skillLevel ?? existingStaff.skillLevel,
        notes: notes !== undefined ? notes : existingStaff.notes,
        role: role ?? existingStaff.role,
        storeId: storeId ?? existingStaff.storeId,
      })
      .where(eq(staff.id, staffId))
      .returning();

    return NextResponse.json(updatedStaff);
  } catch (error) {
    console.error('スタッフ更新エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'スタッフの更新に失敗しました' }, { status: 500 });
  }
}

// スタッフ削除
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const staffId = parseInt(id);

    // 既存スタッフ確認
    const [existingStaff] = await db.select().from(staff).where(eq(staff.id, staffId));

    if (!existingStaff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, existingStaff.storeId)) {
      return NextResponse.json({ error: 'このスタッフへのアクセス権限がありません' }, { status: 403 });
    }

    // オーナー・店長の削除はオーナーのみ
    if ((existingStaff.role === 'owner' || existingStaff.role === 'manager') && session.role !== 'owner') {
      return NextResponse.json({ error: 'オーナー・店長の削除にはオーナー権限が必要です' }, { status: 403 });
    }

    // 自分自身は削除不可
    if (existingStaff.id === session.id) {
      return NextResponse.json({ error: '自分自身を削除することはできません' }, { status: 400 });
    }

    await db.delete(staff).where(eq(staff.id, staffId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('スタッフ削除エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'スタッフの削除に失敗しました' }, { status: 500 });
  }
}
