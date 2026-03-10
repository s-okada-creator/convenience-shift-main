import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(error: unknown, context: string): NextResponse {
  // ApiErrorの場合はそのまま返す
  if (error instanceof ApiError) {
    console.error(`[${context}] ${error.message}`);
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  // 標準Errorの場合
  if (error instanceof Error) {
    console.error(`[${context}] ${error.message}`);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }

  // 不明なエラー
  console.error(`[${context}] Unknown error occurred`);
  return NextResponse.json(
    { error: 'サーバーエラーが発生しました' },
    { status: 500 }
  );
}

// よく使うエラーを生成するヘルパー
export const ApiErrors = {
  unauthorized: () => new ApiError(401, '認証が必要です', 'UNAUTHORIZED'),
  forbidden: () => new ApiError(403, 'アクセス権限がありません', 'FORBIDDEN'),
  notFound: (resource: string) => new ApiError(404, `${resource}が見つかりません`, 'NOT_FOUND'),
  badRequest: (message: string) => new ApiError(400, message, 'BAD_REQUEST'),
  conflict: (message: string) => new ApiError(409, message, 'CONFLICT'),
};
