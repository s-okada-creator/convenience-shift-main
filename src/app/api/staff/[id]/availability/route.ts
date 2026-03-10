import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { staff, availabilityPatterns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 勤務可能時間パターン取得
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { id } = await params;
    const staffId = parseInt(id);

    // スタッフ存在確認
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));

    if (!staffMember) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, staffMember.storeId)) {
      return NextResponse.json({ error: 'このスタッフへのアクセス権限がありません' }, { status: 403 });
    }

    const patterns = await db.select()
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.staffId, staffId));

    return NextResponse.json(
      patterns.map((p) => ({
        ...p,
        startTime: p.startTime.slice(0, 5),
        endTime: p.endTime.slice(0, 5),
      }))
    );
  } catch (error) {
    console.error('勤務可能時間取得エラー:', error);
    return NextResponse.json({ error: '勤務可能時間の取得に失敗しました' }, { status: 500 });
  }
}

// 勤務可能時間パターン一括更新
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const staffId = parseInt(id);
    const body = await request.json();

    // スタッフ存在確認
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));

    if (!staffMember) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 });
    }

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, staffMember.storeId)) {
      return NextResponse.json({ error: 'このスタッフへのアクセス権限がありません' }, { status: 403 });
    }

    const { patterns } = body;

    if (!Array.isArray(patterns)) {
      return NextResponse.json({ error: 'patterns配列が必要です' }, { status: 400 });
    }

    // バリデーション
    for (const pattern of patterns) {
      if (pattern.dayOfWeek < 0 || pattern.dayOfWeek > 6) {
        return NextResponse.json({ error: '曜日は0〜6の範囲で指定してください' }, { status: 400 });
      }
      if (!pattern.startTime || !pattern.endTime) {
        return NextResponse.json({ error: '開始時間と終了時間は必須です' }, { status: 400 });
      }
    }

    // 既存パターンを削除
    await db.delete(availabilityPatterns).where(eq(availabilityPatterns.staffId, staffId));

    // 新しいパターンを挿入
    if (patterns.length > 0) {
      const newPatterns = patterns.map((p: { dayOfWeek: number; startTime: string; endTime: string }) => ({
        staffId,
        dayOfWeek: p.dayOfWeek,
        startTime: p.startTime,
        endTime: p.endTime,
      }));

      await db.insert(availabilityPatterns).values(newPatterns);
    }

    // 更新後のパターンを取得
    const updatedPatterns = await db.select()
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.staffId, staffId));

    return NextResponse.json(
      updatedPatterns.map((p) => ({
        ...p,
        startTime: p.startTime.slice(0, 5),
        endTime: p.endTime.slice(0, 5),
      }))
    );
  } catch (error) {
    console.error('勤務可能時間更新エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: '勤務可能時間の更新に失敗しました' }, { status: 500 });
  }
}
