import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

// デモユーザー定義
export const DEMO_USERS = {
  owner: {
    id: 1,
    name: '山田太郎',
    role: 'owner' as const,
    storeId: null, // オーナーは全店舗アクセス可能
  },
  manager1: {
    id: 2,
    name: '佐藤花子',
    role: 'manager' as const,
    storeId: 1, // 渋谷店
  },
  manager2: {
    id: 3,
    name: '鈴木一郎',
    role: 'manager' as const,
    storeId: 2, // 新宿店
  },
  manager3: {
    id: 4,
    name: '高橋美咲',
    role: 'manager' as const,
    storeId: 3, // 池袋店
  },
  staff1: {
    id: 5,
    name: '田中健太',
    role: 'staff' as const,
    storeId: 1, // 渋谷店
  },
} as const;

export type DemoUser = (typeof DEMO_USERS)[keyof typeof DEMO_USERS];
export type UserRole = 'owner' | 'manager' | 'staff';

const SESSION_COOKIE_NAME = 'demo_session';
const SESSION_COOKIE_SEPARATOR = '.';

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set');
  }
  return secret;
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function encodeSessionCookie(user: SessionUser, secret: string): string {
  const payload = Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
  const signature = signPayload(payload, secret);
  return `${payload}${SESSION_COOKIE_SEPARATOR}${signature}`;
}

function decodeSessionCookie(value: string, secret: string): SessionUser | null {
  const parts = value.split(SESSION_COOKIE_SEPARATOR);
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = signPayload(payload, secret);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as SessionUser;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: number;
  name: string;
  role: UserRole;
  storeId: number | null;
}

// セッション取得
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  try {
    const secret = getSessionSecret();
    return decodeSessionCookie(sessionCookie.value, secret);
  } catch {
    return null;
  }
}

// ログイン
export async function login(userKey: keyof typeof DEMO_USERS): Promise<SessionUser> {
  const user = DEMO_USERS[userKey];
  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
  };

  const cookieStore = await cookies();
  const secret = getSessionSecret();
  const signedValue = encodeSessionCookie(sessionUser, secret);
  cookieStore.set(SESSION_COOKIE_NAME, signedValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7日間
  });

  return sessionUser;
}

// ログアウト
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// 認証チェック（管理者のみ）
export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session || session.role === 'staff') {
    throw new Error('管理者権限が必要です');
  }
  return session;
}

// 認証チェック（ログイン必須）
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error('ログインが必要です');
  }
  return session;
}

// 店舗アクセス権限チェック
export function canAccessStore(user: SessionUser, storeId: number): boolean {
  if (user.role === 'owner') {
    return true;
  }
  return user.storeId === storeId;
}
