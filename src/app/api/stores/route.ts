import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession, canAccessStore } from '@/lib/auth';

// 店舗一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    // オーナーは全店舗、それ以外は自店舗のみ
    if (session.role === 'owner') {
      const storeList = await db.select().from(stores);
      return NextResponse.json(storeList);
    } else if (session.storeId) {
      const storeList = await db.select().from(stores).where(eq(stores.id, session.storeId));
      return NextResponse.json(storeList);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('店舗一覧取得エラー:', error);
    return NextResponse.json({ error: '店舗一覧の取得に失敗しました' }, { status: 500 });
  }
}
