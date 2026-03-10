import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';

// 通知一覧取得（現在のユーザー向け、未読件数付き）
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const conditions = [eq(notifications.userId, session.id)];

    if (unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    const allNotifications = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));

    // 未読件数を取得
    const unreadNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, session.id),
          isNull(notifications.readAt)
        )
      );

    return NextResponse.json({
      notifications: allNotifications,
      unreadCount: unreadNotifications.length,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/notifications');
  }
}

// 通知を既読にする
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    const { notificationIds, markAllRead } = body;

    if (markAllRead) {
      // 全件既読
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, session.id),
            isNull(notifications.readAt)
          )
        );

      return NextResponse.json({ success: true, message: '全通知を既読にしました' });
    }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      throw ApiErrors.badRequest('通知IDが必要です');
    }

    // 指定された通知が自分のものか確認してから既読にする
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, session.id),
          inArray(notifications.id, notificationIds)
        )
      );

    return NextResponse.json({ success: true, message: '通知を既読にしました' });
  } catch (error) {
    return handleApiError(error, 'PUT /api/notifications');
  }
}
