/**
 * シンプルなメモリベースのレート制限
 * 注意: サーバーレス環境では複数インスタンス間で状態が共有されないため、
 * 本番環境ではRedis等の外部ストレージを使用することを推奨
 */

interface RateLimitRecord {
  count: number;
  timestamp: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// 定期的に古いエントリをクリーンアップ
const CLEANUP_INTERVAL = 60 * 1000; // 1分
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.timestamp > windowMs) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * レート制限をチェック
 * @param identifier クライアント識別子（IPアドレスなど）
 * @param limit 制限時間内の最大リクエスト数
 * @param windowMs 制限時間（ミリ秒）
 * @returns リクエストが許可されればtrue、制限に達していればfalse
 */
export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  // クリーンアップ
  cleanup(windowMs);

  const record = rateLimitMap.get(identifier);

  // 新規または期限切れ
  if (!record || now - record.timestamp > windowMs) {
    rateLimitMap.set(identifier, { count: 1, timestamp: now });
    return {
      success: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  // 制限に達している
  if (record.count >= limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: record.timestamp + windowMs,
    };
  }

  // カウントを増加
  record.count++;
  return {
    success: true,
    remaining: limit - record.count,
    resetAt: record.timestamp + windowMs,
  };
}

/**
 * レート制限設定のプリセット
 */
export const RateLimitPresets = {
  // ログイン: 5回/分
  login: { limit: 5, windowMs: 60 * 1000 },
  // 通常API: 100回/分
  api: { limit: 100, windowMs: 60 * 1000 },
  // 重い処理（AI等）: 10回/分
  heavy: { limit: 10, windowMs: 60 * 1000 },
} as const;

/**
 * IPアドレスを取得
 */
export function getClientIp(request: Request): string {
  // Vercel/Cloudflare等のプロキシ経由の場合
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // その他のヘッダー
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // フォールバック
  return 'unknown';
}
