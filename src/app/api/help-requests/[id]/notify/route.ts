import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, staff, stores, shifts, timeOffRequests, availabilityPatterns, notifications } from '@/lib/db/schema';
import { eq, and, ne, or } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { sendStoreDiscordNotification, formatDateForDiscord } from '@/lib/discord';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// スタッフ直接通知（条件に合うスタッフを抽出してDiscord + アプリ内通知）
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);

    // ヘルプ要請の存在確認
    const [helpRequest] = await db.select().from(helpRequests).where(eq(helpRequests.id, requestId));
    if (!helpRequest) {
      throw ApiErrors.notFound('ヘルプ要請');
    }

    // 既に通知済みの場合はエラー
    if (helpRequest.staffNotified) {
      throw ApiErrors.badRequest('既にスタッフへ通知済みです');
    }

    // 取り下げ・クローズ済みの場合はエラー
    if (helpRequest.status === 'withdrawn' || helpRequest.status === 'closed') {
      throw ApiErrors.badRequest('この要請にはスタッフ通知を送れません');
    }

    // 店舗名取得
    const [store] = await db.select().from(stores).where(eq(stores.id, helpRequest.storeId));

    // 条件に合うスタッフを抽出:
    // 1. 他店勤務可能（canWorkOtherStores = true）
    // 2. 要請元の店舗以外のスタッフ
    // 3. roleがstaff（店長は除外）
    const eligibleStaff = await db
      .select({
        id: staff.id,
        name: staff.name,
        storeId: staff.storeId,
        skills: staff.skills,
      })
      .from(staff)
      .where(
        and(
          eq(staff.canWorkOtherStores, true),
          ne(staff.storeId, helpRequest.storeId),
          eq(staff.role, 'staff')
        )
      );

    // 該当日に休み希望が承認されているスタッフを除外
    const approvedTimeOffs = await db
      .select({ staffId: timeOffRequests.staffId })
      .from(timeOffRequests)
      .where(
        and(
          eq(timeOffRequests.date, helpRequest.needDate),
          eq(timeOffRequests.status, 'approved')
        )
      );
    const timeOffStaffIds = new Set(approvedTimeOffs.map(t => t.staffId));

    // 該当日に既にシフトが入っているスタッフを除外（時間重複チェック）
    const existingShifts = await db
      .select({ staffId: shifts.staffId, startTime: shifts.startTime, endTime: shifts.endTime })
      .from(shifts)
      .where(eq(shifts.date, helpRequest.needDate));

    const busyStaffIds = new Set<number>();
    for (const shift of existingShifts) {
      const shiftStart = shift.startTime.slice(0, 5);
      const shiftEnd = shift.endTime.slice(0, 5);
      const needStart = helpRequest.needStart.slice(0, 5);
      const needEnd = helpRequest.needEnd.slice(0, 5);
      // 時間帯が重複するか判定
      if (shiftStart < needEnd && shiftEnd > needStart) {
        busyStaffIds.add(shift.staffId);
      }
    }

    // 該当曜日に勤務可能パターンがあるスタッフを優先（なくても除外はしない）
    const needDate = new Date(helpRequest.needDate + 'T00:00:00');
    const dayOfWeek = needDate.getDay(); // 0=日, 1=月, ...

    const availablePatterns = await db
      .select({ staffId: availabilityPatterns.staffId })
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.dayOfWeek, dayOfWeek));
    const availableStaffIds = new Set(availablePatterns.map(a => a.staffId));

    // フィルタリング
    const notifiedStaff = eligibleStaff.filter(s => {
      if (timeOffStaffIds.has(s.id)) return false;
      if (busyStaffIds.has(s.id)) return false;
      return true;
    });

    if (notifiedStaff.length === 0) {
      // スタッフが見つからなくてもstaffNotifiedをtrueにする
      await db
        .update(helpRequests)
        .set({ staffNotified: true, updatedAt: new Date() })
        .where(eq(helpRequests.id, requestId));

      return NextResponse.json({
        success: true,
        message: '条件に合うスタッフが見つかりませんでした',
        notifiedCount: 0,
      });
    }

    // アプリ内通知レコード作成
    const notificationRecords = notifiedStaff.map(s => ({
      userId: s.id,
      type: 'staff_help_notify',
      payload: {
        helpRequestId: requestId,
        storeId: helpRequest.storeId,
        storeName: store?.name || '',
        needDate: helpRequest.needDate,
        needStart: helpRequest.needStart.slice(0, 5),
        needEnd: helpRequest.needEnd.slice(0, 5),
        memo: helpRequest.memo || null,
      },
    }));

    await db.insert(notifications).values(notificationRecords);

    // staffNotifiedフラグを更新
    await db
      .update(helpRequests)
      .set({ staffNotified: true, updatedAt: new Date() })
      .where(eq(helpRequests.id, requestId));

    // Discord通知送信（各店舗チャンネルへ）
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://convenience-shift-main.vercel.app';
    const formattedDate = formatDateForDiscord(helpRequest.needDate);
    const timeRange = `${helpRequest.needStart.slice(0, 5)}〜${helpRequest.needEnd.slice(0, 5)}`;

    // 対象スタッフの所属店舗IDを重複なく取得
    const targetStoreIds = [...new Set(notifiedStaff.map(s => s.storeId))];

    for (const storeId of targetStoreIds) {
      const storeStaff = notifiedStaff.filter(s => s.storeId === storeId);
      const staffNames = storeStaff.map(s => s.name).join('、');

      const storeMessage = [
        `📢【ヘルプ募集】${store?.name || ''}が人手を求めています！`,
        ``,
        `📅 ${formattedDate} ${timeRange}`,
        helpRequest.memo ? `📝 ${helpRequest.memo}` : null,
        ``,
        `💪 対象: ${staffNames}さん`,
        ``,
        `✅ 行ける方はこちらから応募してください👇`,
        `🔗 ${appUrl}/dashboard/help-board/${requestId}`,
      ].filter(Boolean).join('\n');

      await sendStoreDiscordNotification(storeId, storeMessage);
    }

    return NextResponse.json({
      success: true,
      message: `${notifiedStaff.length}名のスタッフに通知しました`,
      notifiedCount: notifiedStaff.length,
      notifiedStaff: notifiedStaff.map(s => ({ id: s.id, name: s.name })),
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/help-requests/[id]/notify');
  }
}
