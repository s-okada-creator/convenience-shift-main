import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 認証middleware
 * 保護対象のルートへのアクセスを一元管理
 */
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('demo_session');
  const { pathname } = request.nextUrl;

  // 除外パス（認証不要）
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/logout',
    '/login',
    '/',
  ];

  // 完全一致でチェック
  const isPublicPath = publicPaths.some(path => pathname === path);

  // 静的アセット、_next、faviconは除外
  const isStaticAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.ico');

  if (isStaticAsset || isPublicPath) {
    return NextResponse.next();
  }

  // 保護対象パス
  const isProtectedPath =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/dashboard');

  if (isProtectedPath && !sessionCookie) {
    // APIの場合は401を返す
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    // ページの場合はトップページ（ログイン画面）にリダイレクト
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
