import { NextRequest, NextResponse } from 'next/server';
import { login, DEMO_USERS } from '@/lib/auth';
import { rateLimit, RateLimitPresets, getClientIp } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { stores, staff } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    // 開発環境ではレート制限をスキップ
    const isDev = process.env.NODE_ENV === 'development';

    // レート制限チェック
    const clientIp = getClientIp(request);
    const rateLimitResult = rateLimit(
      `login:${clientIp}`,
      isDev ? 1000 : RateLimitPresets.login.limit, // 開発環境では緩和
      RateLimitPresets.login.windowMs
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(RateLimitPresets.login.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimitResult.resetAt),
          },
        }
      );
    }

    const { userKey } = await request.json();

    if (!userKey || !(userKey in DEMO_USERS)) {
      return NextResponse.json(
        { error: '無効なユーザーです' },
        { status: 400 }
      );
    }

    // DBから実際の店舗ID・スタッフIDを取得してセッションに反映
    const demoUser = DEMO_USERS[userKey as keyof typeof DEMO_USERS];
    const storeNameMap: Record<number, string> = { 1: '寝屋川A店', 2: '寝屋川B店', 3: '寝屋川C店' };
    let resolvedStoreId: number | null = demoUser.storeId;
    let resolvedUserId: number | null = null;

    if (demoUser.storeId && storeNameMap[demoUser.storeId]) {
      const [dbStore] = await db.select().from(stores).where(eq(stores.name, storeNameMap[demoUser.storeId]));
      if (dbStore) {
        resolvedStoreId = dbStore.id;
      }
    }

    // staffテーブルからIDを解決
    // まず名前で検索
    const [dbStaffByName] = await db.select().from(staff).where(eq(staff.name, demoUser.name));
    if (dbStaffByName) {
      resolvedUserId = dbStaffByName.id;
      if (demoUser.role !== 'owner') {
        resolvedStoreId = dbStaffByName.storeId;
      }
    } else if (resolvedStoreId) {
      // 名前が見つからない場合、同じ店舗・同じロールのスタッフから最初の1人を取得
      const [dbStaffByRole] = await db
        .select()
        .from(staff)
        .where(
          and(
            eq(staff.storeId, resolvedStoreId),
            eq(staff.role, demoUser.role)
          )
        )
        .limit(1);
      if (dbStaffByRole) {
        resolvedUserId = dbStaffByRole.id;
        resolvedStoreId = dbStaffByRole.storeId;
      }
    }

    const user = await login(userKey as keyof typeof DEMO_USERS, resolvedStoreId, resolvedUserId);

    return NextResponse.json(
      { user },
      {
        headers: {
          'X-RateLimit-Limit': String(RateLimitPresets.login.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        },
      }
    );
  } catch (error) {
    console.error('Login error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'ログインに失敗しました' },
      { status: 500 }
    );
  }
}
