import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { staff, availabilityPatterns } from '@/lib/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { getSession, canAccessStore } from '@/lib/auth';

// 店舗全スタッフの勤務可能時間パターン一括取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');
    const dayOfWeek = searchParams.get('dayOfWeek');

    if (!storeId) {
      return NextResponse.json({ error: 'storeIdは必須です' }, { status: 400 });
    }

    const storeIdNum = parseInt(storeId);

    // 店舗アクセス権限チェック
    if (!canAccessStore(session, storeIdNum)) {
      return NextResponse.json({ error: 'この店舗へのアクセス権限がありません' }, { status: 403 });
    }

    // 店舗のスタッフIDを取得
    const staffList = await db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.storeId, storeIdNum));

    if (staffList.length === 0) {
      return NextResponse.json({});
    }

    const staffIds = staffList.map((s) => s.id);

    // 全スタッフの勤務可能時間パターンを一括取得
    const conditions = [inArray(availabilityPatterns.staffId, staffIds)];
    if (dayOfWeek !== null) {
      const dayNum = parseInt(dayOfWeek, 10);
      if (!Number.isNaN(dayNum)) {
        conditions.push(eq(availabilityPatterns.dayOfWeek, dayNum));
      }
    }

    const patterns = await db
      .select()
      .from(availabilityPatterns)
      .where(and(...conditions));

    // スタッフIDをキーとしたMapに変換
    const result: Record<number, typeof patterns> = {};
    for (const pattern of patterns) {
      const normalizedPattern = {
        ...pattern,
        startTime: pattern.startTime.slice(0, 5),
        endTime: pattern.endTime.slice(0, 5),
      };
      if (!result[pattern.staffId]) {
        result[pattern.staffId] = [];
      }
      result[pattern.staffId].push(normalizedPattern);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('勤務可能時間一括取得エラー:', error);
    return NextResponse.json({ error: '勤務可能時間の取得に失敗しました' }, { status: 500 });
  }
}
