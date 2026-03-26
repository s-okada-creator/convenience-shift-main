import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { helpRequests, helpOffers, staffHelpResponses, stores, staff, shifts, shiftRequirements, timeOffRequests, notifications } from '@/lib/db/schema';
import { eq, and, or, ne, gte, lte, sql, count } from 'drizzle-orm';
import { getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 7日先まで
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);
    const weekLaterStr = weekLater.toISOString().split('T')[0];

    // ============================
    // 1. 未対応のヘルプ要請（他店からの助けを求めている）
    // ============================
    const openHelpRequests = await db
      .select({
        id: helpRequests.id,
        storeId: helpRequests.storeId,
        storeName: stores.name,
        needDate: helpRequests.needDate,
        needStart: helpRequests.needStart,
        needEnd: helpRequests.needEnd,
        memo: helpRequests.memo,
        status: helpRequests.status,
        staffNotified: helpRequests.staffNotified,
        createdAt: helpRequests.createdAt,
      })
      .from(helpRequests)
      .leftJoin(stores, eq(helpRequests.storeId, stores.id))
      .where(
        and(
          or(eq(helpRequests.status, 'open'), eq(helpRequests.status, 'offered')),
          gte(helpRequests.needDate, todayStr)
        )
      );

    // ============================
    // 2. 自店舗のヘルプ要請への応答（オファー・スタッフ応募）
    // ============================
    let pendingOffersForMyRequests: Array<{
      helpRequestId: number;
      storeName: string;
      staffName: string;
      staffStoreName: string;
      needDate: string;
      offerStart: string;
      offerEnd: string;
      type: 'store_offer' | 'staff_response';
      offerId: number | null;
      responseId: number | null;
      message: string | null;
      isPartial: boolean;
      requestNeedStart: string;
      requestNeedEnd: string;
    }> = [];

    // 自分が作った or 自店舗のヘルプ要請を取得
    const myStoreRequests = session.role === 'owner'
      ? openHelpRequests // オーナーは全部見える
      : openHelpRequests.filter(r => session.storeId && r.storeId === session.storeId);

    const myStoreRequestIds = myStoreRequests.map(r => r.id);

    if (myStoreRequestIds.length > 0) {
      // 店舗オファー（pending）
      // storesテーブルをスタッフ所属店舗用にエイリアスとして使うため、サブクエリで取得
      for (const reqId of myStoreRequestIds) {
        const pendingOffers = await db
          .select({
            id: helpOffers.id,
            requestId: helpOffers.requestId,
            staffId: helpOffers.staffId,
            staffName: staff.name,
            storeName: stores.name,
            offerStart: helpOffers.offerStart,
            offerEnd: helpOffers.offerEnd,
            isPartial: helpOffers.isPartial,
          })
          .from(helpOffers)
          .leftJoin(staff, eq(helpOffers.staffId, staff.id))
          .leftJoin(stores, eq(helpOffers.offeringStoreId, stores.id))
          .where(
            and(
              eq(helpOffers.requestId, reqId),
              eq(helpOffers.status, 'pending')
            )
          );

        const request = myStoreRequests.find(r => r.id === reqId);

        // スタッフの所属店舗名を取得
        for (const offer of pendingOffers) {
          let staffStoreName = offer.storeName || '';
          if (offer.staffId) {
            const staffRecord = await db
              .select({ storeId: staff.storeId })
              .from(staff)
              .where(eq(staff.id, offer.staffId))
              .limit(1);
            if (staffRecord.length > 0) {
              const staffStore = await db
                .select({ name: stores.name })
                .from(stores)
                .where(eq(stores.id, staffRecord[0].storeId))
                .limit(1);
              if (staffStore.length > 0) {
                staffStoreName = staffStore[0].name;
              }
            }
          }

          pendingOffersForMyRequests.push({
            helpRequestId: reqId,
            storeName: offer.storeName || '',
            staffName: offer.staffName || '',
            staffStoreName,
            needDate: request?.needDate || '',
            offerStart: offer.offerStart.slice(0, 5),
            offerEnd: offer.offerEnd.slice(0, 5),
            type: 'store_offer',
            offerId: offer.id,
            responseId: null,
            message: null,
            isPartial: offer.isPartial,
            requestNeedStart: request?.needStart?.slice(0, 5) || '',
            requestNeedEnd: request?.needEnd?.slice(0, 5) || '',
          });
        }

        // スタッフ直接応募（pending）
        const pendingResponses = await db
          .select({
            id: staffHelpResponses.id,
            requestId: staffHelpResponses.requestId,
            staffId: staffHelpResponses.staffId,
            staffName: staff.name,
            staffStoreId: staff.storeId,
            offerStart: staffHelpResponses.offerStart,
            offerEnd: staffHelpResponses.offerEnd,
            isPartial: staffHelpResponses.isPartial,
            message: staffHelpResponses.message,
          })
          .from(staffHelpResponses)
          .leftJoin(staff, eq(staffHelpResponses.staffId, staff.id))
          .where(
            and(
              eq(staffHelpResponses.requestId, reqId),
              eq(staffHelpResponses.status, 'pending')
            )
          );

        for (const resp of pendingResponses) {
          let staffStoreName = '';
          if (resp.staffStoreId) {
            const staffStore = await db
              .select({ name: stores.name })
              .from(stores)
              .where(eq(stores.id, resp.staffStoreId))
              .limit(1);
            if (staffStore.length > 0) {
              staffStoreName = staffStore[0].name;
            }
          }

          pendingOffersForMyRequests.push({
            helpRequestId: reqId,
            storeName: '',
            staffName: resp.staffName || '',
            staffStoreName,
            needDate: request?.needDate || '',
            offerStart: resp.offerStart.slice(0, 5),
            offerEnd: resp.offerEnd.slice(0, 5),
            type: 'staff_response',
            offerId: null,
            responseId: resp.id,
            message: resp.message,
            isPartial: resp.isPartial,
            requestNeedStart: request?.needStart?.slice(0, 5) || '',
            requestNeedEnd: request?.needEnd?.slice(0, 5) || '',
          });
        }
      }
    }

    // ============================
    // 3. 今日〜7日間の人員不足チェック（管理者のみ）
    // ============================
    let staffingGaps: Array<{
      date: string;
      dayOfWeek: number;
      timeSlot: string;
      required: number;
      actual: number;
      shortage: number;
    }> = [];

    if (session.role !== 'staff' && session.storeId) {
      const storeId = session.storeId;

      // 必要人数設定を取得
      const requirements = await db
        .select()
        .from(shiftRequirements)
        .where(eq(shiftRequirements.storeId, storeId));

      if (requirements.length > 0) {
        // 今日〜7日間のシフトを取得
        const weekShifts = await db
          .select()
          .from(shifts)
          .where(
            and(
              eq(shifts.storeId, storeId),
              gte(shifts.date, todayStr),
              lte(shifts.date, weekLaterStr)
            )
          );

        // 日毎にチェック
        for (let i = 0; i < 7; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(checkDate.getDate() + i);
          const checkDateStr = checkDate.toISOString().split('T')[0];
          const dayOfWeek = checkDate.getDay();

          const dayRequirements = requirements.filter(r => r.dayOfWeek === dayOfWeek);
          const dayShifts = weekShifts.filter(s => s.date === checkDateStr);

          for (const req of dayRequirements) {
            if (req.requiredCount <= 0) continue;

            const timeSlot = req.timeSlot.slice(0, 5);
            // このタイムスロットにシフトが入ってるスタッフを数える
            const coveringStaff = dayShifts.filter(s => {
              const shiftStart = s.startTime.slice(0, 5);
              const shiftEnd = s.endTime.slice(0, 5);
              return shiftStart <= timeSlot && shiftEnd > timeSlot;
            });

            const shortage = req.requiredCount - coveringStaff.length;
            if (shortage > 0) {
              staffingGaps.push({
                date: checkDateStr,
                dayOfWeek,
                timeSlot,
                required: req.requiredCount,
                actual: coveringStaff.length,
                shortage,
              });
            }
          }
        }

        // 連続するスロットをグループ化して、日付ごとに最大不足をまとめる
        const gapsByDate = new Map<string, { date: string; dayOfWeek: number; maxShortage: number; startTime: string; endTime: string; slots: number }>();

        for (const gap of staffingGaps) {
          const existing = gapsByDate.get(gap.date);
          if (!existing) {
            gapsByDate.set(gap.date, {
              date: gap.date,
              dayOfWeek: gap.dayOfWeek,
              maxShortage: gap.shortage,
              startTime: gap.timeSlot,
              endTime: gap.timeSlot,
              slots: 1,
            });
          } else {
            existing.maxShortage = Math.max(existing.maxShortage, gap.shortage);
            if (gap.timeSlot < existing.startTime) existing.startTime = gap.timeSlot;
            if (gap.timeSlot > existing.endTime) existing.endTime = gap.timeSlot;
            existing.slots++;
          }
        }

        staffingGaps = []; // reset for grouped result
        // Convert to simplified format
        const groupedGaps = Array.from(gapsByDate.values()).map(g => ({
          date: g.date,
          dayOfWeek: g.dayOfWeek,
          timeSlot: `${g.startTime}〜${g.endTime}`,
          required: 0,
          actual: 0,
          shortage: g.maxShortage,
        }));
        staffingGaps = groupedGaps;
      }
    }

    // オーナーの場合は全店舗の不足を取得
    let allStoreGaps: Array<{
      storeId: number;
      storeName: string;
      date: string;
      shortage: number;
    }> = [];

    if (session.role === 'owner') {
      const allStores = await db.select().from(stores);
      for (const store of allStores) {
        const requirements = await db
          .select()
          .from(shiftRequirements)
          .where(eq(shiftRequirements.storeId, store.id));

        if (requirements.length === 0) continue;

        const todayShifts = await db
          .select()
          .from(shifts)
          .where(
            and(
              eq(shifts.storeId, store.id),
              eq(shifts.date, todayStr)
            )
          );

        const todayDow = today.getDay();
        const todayReqs = requirements.filter(r => r.dayOfWeek === todayDow);

        let maxShortage = 0;
        for (const req of todayReqs) {
          if (req.requiredCount <= 0) continue;
          const timeSlot = req.timeSlot.slice(0, 5);
          const covering = todayShifts.filter(s => {
            const start = s.startTime.slice(0, 5);
            const end = s.endTime.slice(0, 5);
            return start <= timeSlot && end > timeSlot;
          });
          const shortage = req.requiredCount - covering.length;
          if (shortage > maxShortage) maxShortage = shortage;
        }

        if (maxShortage > 0) {
          allStoreGaps.push({
            storeId: store.id,
            storeName: store.name,
            date: todayStr,
            shortage: maxShortage,
          });
        }
      }
    }

    // ============================
    // 4. 未読通知数
    // ============================
    const unreadNotifications = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, session.id),
          sql`${notifications.readAt} IS NULL`
        )
      );

    // ============================
    // 5. 最近確定したヘルプ（直近3件）
    // ============================
    const recentConfirmed = await db
      .select({
        id: helpRequests.id,
        storeId: helpRequests.storeId,
        storeName: stores.name,
        needDate: helpRequests.needDate,
        needStart: helpRequests.needStart,
        needEnd: helpRequests.needEnd,
        updatedAt: helpRequests.updatedAt,
      })
      .from(helpRequests)
      .leftJoin(stores, eq(helpRequests.storeId, stores.id))
      .where(eq(helpRequests.status, 'confirmed'))
      .orderBy(sql`${helpRequests.updatedAt} DESC`)
      .limit(3);

    // ============================
    // 6. スタッフ向け：自分宛ての通知があるか
    // ============================
    let staffHelpNotifications: Array<{
      helpRequestId: number;
      storeName: string;
      needDate: string;
      needStart: string;
      needEnd: string;
    }> = [];

    if (session.role === 'staff') {
      const myNotifs = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, session.id),
            eq(notifications.type, 'staff_help_notify'),
            sql`${notifications.readAt} IS NULL`
          )
        );

      staffHelpNotifications = myNotifs.map(n => {
        const payload = n.payload as Record<string, unknown>;
        return {
          helpRequestId: payload.helpRequestId as number,
          storeName: payload.storeName as string,
          needDate: payload.needDate as string,
          needStart: payload.needStart as string,
          needEnd: payload.needEnd as string,
        };
      });
    }

    return NextResponse.json({
      // 全店のopen/offeredヘルプ要請
      openHelpRequests: openHelpRequests.map(r => ({
        ...r,
        needStart: r.needStart.slice(0, 5),
        needEnd: r.needEnd.slice(0, 5),
      })),
      // 自店舗のヘルプ要請に対する確認待ちオファー/応募
      pendingOffersForMyRequests,
      // 人員不足（店長用）
      staffingGaps,
      // 全店舗の人員不足（オーナー用）
      allStoreGaps,
      // 未読通知数
      unreadCount: unreadNotifications[0]?.count || 0,
      // 最近確定したヘルプ
      recentConfirmed: recentConfirmed.map(r => ({
        ...r,
        needStart: r.needStart.slice(0, 5),
        needEnd: r.needEnd.slice(0, 5),
      })),
      // スタッフ向け：ヘルプ募集通知
      staffHelpNotifications,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/dashboard-alerts');
  }
}
