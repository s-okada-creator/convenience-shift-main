import { NextRequest, NextResponse } from 'next/server';
import { login, DEMO_USERS } from '@/lib/auth';
import { rateLimit, RateLimitPresets, getClientIp } from '@/lib/rate-limit';

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

    const user = await login(userKey as keyof typeof DEMO_USERS);

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
