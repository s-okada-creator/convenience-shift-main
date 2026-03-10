import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { staff, stores, availabilityPatterns } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';

// スタッフ一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');

    if (storeId) {
      const storeIdNum = parseInt(storeId);
      // 店舗アクセス権限チェック
      if (!canAccessStore(session, storeIdNum)) {
        return NextResponse.json({ error: 'この店舗へのアクセス権限がありません' }, { status: 403 });
      }
      const staffList = await db
        .select({
          id: staff.id,
          storeId: staff.storeId,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          employmentType: staff.employmentType,
          hourlyRate: staff.hourlyRate,
          joinedAt: staff.joinedAt,
          skillLevel: staff.skillLevel,
          notes: staff.notes,
          role: staff.role,
          createdAt: staff.createdAt,
        })
        .from(staff)
        .where(eq(staff.storeId, storeIdNum));
      return NextResponse.json(staffList);
    }

    // オーナーは全店舗、それ以外は自店舗のみ
    if (session.role === 'owner') {
      const staffList = await db
        .select({
          id: staff.id,
          storeId: staff.storeId,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          employmentType: staff.employmentType,
          hourlyRate: staff.hourlyRate,
          joinedAt: staff.joinedAt,
          skillLevel: staff.skillLevel,
          notes: staff.notes,
          role: staff.role,
          createdAt: staff.createdAt,
        })
        .from(staff);
      return NextResponse.json(staffList);
    } else if (session.storeId) {
      const staffList = await db
        .select({
          id: staff.id,
          storeId: staff.storeId,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          employmentType: staff.employmentType,
          hourlyRate: staff.hourlyRate,
          joinedAt: staff.joinedAt,
          skillLevel: staff.skillLevel,
          notes: staff.notes,
          role: staff.role,
          createdAt: staff.createdAt,
        })
        .from(staff)
        .where(eq(staff.storeId, session.storeId));
      return NextResponse.json(staffList);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('スタッフ一覧取得エラー:', error);
    return NextResponse.json({ error: 'スタッフ一覧の取得に失敗しました' }, { status: 500 });
  }
}

// スタッフ作成
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    const { storeId, name, email, phone, employmentType, hourlyRate, joinedAt, skillLevel, notes, role } = body;

    // 必須フィールドチェック
    if (!storeId || !name || !employmentType || !hourlyRate || !joinedAt) {
      return NextResponse.json({ error: '必須フィールドが不足しています' }, { status: 400 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, storeId)) {
      return NextResponse.json({ error: 'この店舗へのアクセス権限がありません' }, { status: 403 });
    }

    // オーナー・店長の作成はオーナーのみ
    if ((role === 'owner' || role === 'manager') && session.role !== 'owner') {
      return NextResponse.json({ error: 'オーナー・店長の作成にはオーナー権限が必要です' }, { status: 403 });
    }

    const [newStaff] = await db.insert(staff).values({
      storeId,
      name,
      email,
      phone,
      employmentType,
      hourlyRate,
      joinedAt,
      skillLevel: skillLevel || 1,
      notes,
      role: role || 'staff',
    }).returning();

    return NextResponse.json(newStaff, { status: 201 });
  } catch (error) {
    console.error('スタッフ作成エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'スタッフの作成に失敗しました' }, { status: 500 });
  }
}
