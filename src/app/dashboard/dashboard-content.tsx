'use client';

import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, PageSection, PageGrid } from '@/components/layout/dashboard-layout';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  getDay,
  isToday,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  Calendar,
  Users,
  ClipboardList,
  CalendarDays,
  CalendarOff,
  Clock,
  ArrowRight,
  AlertTriangle,
  Bell,
  CheckCircle,
  MapPin,
  Megaphone,
  UserPlus,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface DashboardContentProps {
  user: SessionUser;
}

interface Shift {
  id: number;
  staffId: number;
  storeId: number;
  date: string;
  startTime: string;
  endTime: string;
  isHelpFromOtherStore: boolean | null;
  storeName?: string | null;
  staffName?: string | null;
}

interface TimeOffRequest {
  id: number;
  staffId: number;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface DashboardAlerts {
  openHelpRequests: Array<{
    id: number;
    storeId: number;
    storeName: string;
    needDate: string;
    needStart: string;
    needEnd: string;
    memo: string | null;
    status: string;
    staffNotified: boolean;
    createdAt: string;
  }>;
  pendingOffersForMyRequests: Array<{
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
  }>;
  unreadCount: number;
  recentConfirmed: Array<{
    id: number;
    storeName: string;
    needDate: string;
    needStart: string;
    needEnd: string;
    updatedAt: string;
  }>;
  staffHelpNotifications: Array<{
    helpRequestId: number;
    storeName: string;
    needDate: string;
    needStart: string;
    needEnd: string;
  }>;
}

const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];

function formatAlertDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = dayOfWeekLabels[d.getDay()];
  return `${month}/${day}(${dow})`;
}

const QuickActionCard = memo(function QuickActionCard({
  title,
  description,
  icon: Icon,
  href,
  badge,
  badgeVariant = 'default',
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary';
}) {
  const router = useRouter();

  return (
    <Card
      className="group border border-[#E5E5EA] shadow-sm hover:bg-[#F5F5F7] transition-colors duration-200 cursor-pointer bg-white overflow-hidden"
      onClick={() => router.push(href)}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] flex items-center justify-center mb-3">
            <Icon className="w-6 h-6 text-[#86868B]" />
          </div>
          {badge && (
            <Badge
              variant={badgeVariant === 'default' ? 'default' : 'secondary'}
              className={badgeVariant === 'default' ? 'bg-[#007AFF] text-white text-xs' : 'bg-[#F5F5F7] text-[#86868B] text-xs'}
            >
              {badge}
            </Badge>
          )}
        </div>
        <CardTitle className="text-base font-semibold text-[#1D1D1F] group-hover:text-[#007AFF] transition-colors">
          {title}
        </CardTitle>
        <CardDescription className="text-sm text-[#86868B]">
          {description}
        </CardDescription>
      </CardHeader>
    </Card>
  );
});

const WeekDayCell = memo(function WeekDayCell({
  day,
  shift,
  timeOff,
}: {
  day: Date;
  shift?: Shift;
  timeOff?: TimeOffRequest;
}) {
  const dayOfWeek = getDay(day);
  const isTodayDate = isToday(day);

  return (
    <div
      className={`p-2 sm:p-3 rounded-xl border transition-all duration-200 ${
        isTodayDate
          ? 'border-[#007AFF] bg-[#007AFF]/5 shadow-sm'
          : 'border-[#E5E5EA] bg-white hover:border-[#D2D2D7]'
      }`}
    >
      <div className="text-center mb-2">
        <span
          className={`text-xs font-medium ${
            dayOfWeek === 0
              ? 'text-[#FF3B30]'
              : dayOfWeek === 6
              ? 'text-[#007AFF]'
              : 'text-[#86868B]'
          }`}
        >
          {dayOfWeekLabels[dayOfWeek]}
        </span>
        <p
          className={`text-lg font-semibold ${
            isTodayDate ? 'text-[#007AFF]' : 'text-[#1D1D1F]'
          }`}
        >
          {format(day, 'd')}
        </p>
      </div>

      {shift ? (
        <div className="bg-[#007AFF] text-white rounded-lg p-2 text-center">
          <p className="text-xs font-medium">{shift.startTime.slice(0, 5)}</p>
          <p className="text-[10px] opacity-70">〜</p>
          <p className="text-xs font-medium">{shift.endTime.slice(0, 5)}</p>
          {shift.isHelpFromOtherStore && (
            <Badge className="mt-1 bg-[#FF9500] text-white text-[10px] px-1.5">
              ヘルプ
            </Badge>
          )}
        </div>
      ) : timeOff ? (
        <div
          className={`rounded-lg p-2 text-center text-xs font-medium ${
            timeOff.status === 'approved'
              ? 'bg-[#34C759]/10 text-[#34C759]'
              : timeOff.status === 'pending'
              ? 'bg-[#FF9500]/10 text-[#FF9500]'
              : 'bg-[#FF3B30]/10 text-[#FF3B30]'
          }`}
        >
          {timeOff.status === 'approved'
            ? '休み'
            : timeOff.status === 'pending'
            ? '申請中'
            : '却下'}
        </div>
      ) : (
        <div className="h-16 flex items-center justify-center">
          <span className="text-sm text-[#D2D2D7]">—</span>
        </div>
      )}
    </div>
  );
});

export function DashboardContent({ user }: DashboardContentProps) {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [openHelpCount, setOpenHelpCount] = useState(0);
  const [openProactiveCount, setOpenProactiveCount] = useState(0);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const isAdmin = user.role === 'owner' || user.role === 'manager';
  const isStaff = user.role === 'staff';

  const weekDays = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 0 });
    const end = endOfWeek(now, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, []);

  const fetchWeeklyData = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = format(weekDays[0], 'yyyy-MM-dd');
      const endDate = format(weekDays[6], 'yyyy-MM-dd');
      const res = await fetch(`/api/my-shifts?startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts || []);
        setTimeOffRequests(data.timeOffRequests || []);
      }
    } catch (error) {
      console.error('週間シフト取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [weekDays]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch('/api/dashboard-alerts');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('アラート取得エラー:', error);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const fetchSummaryCounts = useCallback(async () => {
    try {
      const [helpOpenRes, helpOfferedRes, proactiveRes] = await Promise.all([
        fetch('/api/help-requests?status=open'),
        fetch('/api/help-requests?status=offered'),
        fetch('/api/proactive-offers?status=open'),
      ]);
      let helpCount = 0;
      if (helpOpenRes.ok) {
        const data = await helpOpenRes.json();
        helpCount += data.length;
      }
      if (helpOfferedRes.ok) {
        const data = await helpOfferedRes.json();
        helpCount += data.length;
      }
      setOpenHelpCount(helpCount);
      if (proactiveRes.ok) {
        const data = await proactiveRes.json();
        setOpenProactiveCount(data.length);
      }
    } catch (error) {
      console.error('サマリーカウント取得エラー:', error);
    }
  }, []);

  const handleQuickConfirm = useCallback(async (
    helpRequestId: number,
    type: 'store_offer' | 'staff_response',
    offerId?: number | null,
    responseId?: number | null,
    staffName?: string,
  ) => {
    if (!confirm(`${staffName}さんを確定しますか？シフトが自動登録されます。`)) return;
    setConfirmingId(offerId || responseId || 0);
    try {
      const endpoint = type === 'store_offer'
        ? `/api/help-requests/${helpRequestId}/confirm`
        : `/api/help-requests/${helpRequestId}/confirm-response`;
      const body = type === 'store_offer' ? { offerId } : { responseId };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        fetchAlerts();
        fetchSummaryCounts();
      } else {
        const error = await res.json();
        alert(error.error || '確定に失敗しました');
      }
    } catch {
      alert('確定に失敗しました');
    } finally {
      setConfirmingId(null);
    }
  }, [fetchAlerts, fetchSummaryCounts]);

  const handleNotify = useCallback(async (helpRequestId: number) => {
    try {
      const res = await fetch(`/api/help-requests/${helpRequestId}/notify`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchAlerts();
        alert('スタッフに通知しました');
      } else {
        const error = await res.json();
        alert(error.error || '通知に失敗しました');
      }
    } catch {
      alert('通知に失敗しました');
    }
  }, [fetchAlerts]);

  useEffect(() => {
    fetchWeeklyData();
    fetchAlerts();
    fetchSummaryCounts();
  }, [fetchWeeklyData, fetchAlerts, fetchSummaryCounts]);

  const getShiftForDate = useCallback(
    (date: Date): Shift | undefined => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return shifts.find((s) => s.date === dateStr);
    },
    [shifts]
  );

  const getTimeOffForDate = useCallback(
    (date: Date): TimeOffRequest | undefined => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return timeOffRequests.find((r) => r.date === dateStr);
    },
    [timeOffRequests]
  );

  const weeklyStats = useMemo(() => {
    const shiftCount = shifts.length;
    let totalMinutes = 0;

    shifts.forEach((shift) => {
      const [startHour, startMin] = shift.startTime.split(':').map(Number);
      const [endHour, endMin] = shift.endTime.split(':').map(Number);
      totalMinutes += endHour * 60 + endMin - (startHour * 60 + startMin);
    });

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    return {
      shiftCount,
      totalTime: `${hours}時間${mins > 0 ? `${mins}分` : ''}`,
      totalMinutes,
    };
  }, [shifts]);

  // 他店からのヘルプ要請（自分の店以外）
  const otherStoreHelpRequests = useMemo(() => {
    if (!alerts) return [];
    return alerts.openHelpRequests.filter(r => r.storeId !== user.storeId);
  }, [alerts, user]);

  // 自店のヘルプ要請
  const myStoreHelpRequests = useMemo(() => {
    if (!alerts) return [];
    return alerts.openHelpRequests.filter(r => {
      if (user.role === 'owner') return true;
      return r.storeId === user.storeId;
    });
  }, [alerts, user]);

  // 自店の各求人への応募数をカウント
  const offerCountByRequest = useMemo(() => {
    if (!alerts) return new Map<number, number>();
    const counts = new Map<number, number>();
    for (const offer of alerts.pendingOffersForMyRequests) {
      counts.set(offer.helpRequestId, (counts.get(offer.helpRequestId) || 0) + 1);
    }
    return counts;
  }, [alerts]);

  // 何かアクションが必要か
  const hasUrgentItems = !alertsLoading && alerts && (
    (alerts.pendingOffersForMyRequests?.length || 0) > 0 ||
    myStoreHelpRequests.length > 0 ||
    otherStoreHelpRequests.length > 0 ||
    (alerts.staffHelpNotifications?.length || 0) > 0
  );

  return (
    <DashboardLayout
      user={user}
      title={`おかえりなさい、${user.name}さん`}
      description={
        user.role === 'owner'
          ? '全店舗のシフト管理ダッシュボード'
          : user.role === 'manager'
          ? '担当店舗のシフト管理ダッシュボード'
          : '自分のシフトと予定を確認'
      }
    >
      {/* サマリーカード（人手不足 + 追加勤務希望） */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div
          onClick={() => router.push('/dashboard/help-board')}
          className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#FF3B30] active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#FF3B30]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#86868B] font-medium">人手不足アラート</p>
              <p className="text-lg font-bold text-[#FF3B30]">
                {openHelpCount > 0 ? (
                  <>未解決のヘルプ要請 <span className="text-2xl">{openHelpCount}</span>件</>
                ) : (
                  <span className="text-[#34C759] text-sm font-medium">問題なし</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div
          onClick={() => router.push('/dashboard/extra-shifts')}
          className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#34C759] active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#34C759]/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-[#34C759]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#86868B] font-medium">追加勤務可能スタッフ</p>
              <p className="text-lg font-bold text-[#34C759]">
                {openProactiveCount > 0 ? (
                  <>働きたいスタッフ <span className="text-2xl">{openProactiveCount}</span>名</>
                ) : (
                  <span className="text-[#86868B] text-sm font-medium">なし</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================= */}
      {/* お知らせ・アクション必要セクション */}
      {/* ========================================= */}
      {alertsLoading ? (
        <div className="mb-6">
          <div className="h-32 bg-[#F5F5F7] rounded-2xl animate-pulse" />
        </div>
      ) : alerts && hasUrgentItems ? (
        <div className="mb-6 space-y-4">
          {/* ====== エリア1: 対応が必要です（確認待ちオファー・応募） ====== */}
          {isAdmin && (alerts.pendingOffersForMyRequests?.length || 0) > 0 && (
            <PageSection className="!p-0 overflow-hidden">
              <div className="bg-[#FF9500] px-4 sm:px-6 py-3 flex items-center gap-2">
                <Bell className="w-5 h-5 text-white" />
                <h3 className="text-white font-semibold text-sm sm:text-base">
                  対応が必要です
                </h3>
                <Badge className="bg-white/20 text-white ml-auto">
                  {alerts.pendingOffersForMyRequests.length}件
                </Badge>
              </div>
              <div className="p-4 sm:p-6 space-y-3">
                {alerts.pendingOffersForMyRequests.map((offer, i) => {
                  const itemId = offer.offerId || offer.responseId || 0;
                  const isConfirming = confirmingId === itemId;
                  return (
                    <div
                      key={`${offer.helpRequestId}-${offer.type}-${itemId}-${i}`}
                      className="p-4 rounded-xl border border-[#E5E5EA] bg-white space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-[#1D1D1F]">
                              {offer.staffName}さん
                            </span>
                            {offer.staffStoreName && (
                              <span className="text-xs text-[#86868B]">
                                ({offer.staffStoreName})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-sm text-[#1D1D1F]">
                              {formatAlertDate(offer.needDate)} {offer.offerStart}〜{offer.offerEnd}
                            </span>
                            {offer.isPartial && (
                              <Badge className="bg-[#FF9500]/10 text-[#FF9500] text-[10px] px-1.5">
                                部分対応
                              </Badge>
                            )}
                          </div>
                          {offer.message && (
                            <p className="text-sm text-[#86868B] mt-1.5">
                              {offer.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={isConfirming}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickConfirm(
                              offer.helpRequestId,
                              offer.type,
                              offer.offerId,
                              offer.responseId,
                              offer.staffName,
                            );
                          }}
                          className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl"
                        >
                          {isConfirming ? '処理中...' : '確定する'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/help-board/${offer.helpRequestId}`);
                          }}
                          className="border-[#E5E5EA] text-[#86868B] rounded-xl"
                        >
                          見送る
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PageSection>
          )}

          {/* ====== エリア2: あなたのヘルプ求人（自店の要請） ====== */}
          {isAdmin && myStoreHelpRequests.length > 0 && (
            <PageSection className="!p-0 overflow-hidden">
              <div className="bg-[#FF3B30] px-4 sm:px-6 py-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h3 className="text-white font-semibold text-sm sm:text-base">
                  あなたのヘルプ求人
                </h3>
                <Badge className="bg-white/20 text-white ml-auto">
                  {myStoreHelpRequests.length}件
                </Badge>
              </div>
              <div className="p-4 sm:p-6 space-y-3">
                {myStoreHelpRequests.map((req) => {
                  const offerCount = offerCountByRequest.get(req.id) || 0;
                  const hasOffers = offerCount > 0;
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E5E5EA] bg-white"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-[#1D1D1F]">
                            {formatAlertDate(req.needDate)} {req.needStart}〜{req.needEnd}
                          </span>
                          {hasOffers ? (
                            <Badge className="bg-[#FF9500]/10 text-[#FF9500] text-[10px]">
                              応募あり
                            </Badge>
                          ) : (
                            <Badge className="bg-[#FF3B30]/10 text-[#FF3B30] text-[10px]">
                              未対応
                            </Badge>
                          )}
                          {offerCount > 0 && (
                            <span className="text-xs text-[#86868B]">応募{offerCount}名</span>
                          )}
                        </div>
                        {req.memo && (
                          <p className="text-xs text-[#86868B]">{req.memo}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!hasOffers && !req.staffNotified && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotify(req.id);
                            }}
                            className="border-[#007AFF] text-[#007AFF] rounded-xl text-xs"
                          >
                            <Megaphone className="w-3.5 h-3.5 mr-1" />
                            スタッフに通知
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/dashboard/help-board/${req.id}`)}
                          className="border-[#E5E5EA] text-[#86868B] rounded-xl text-xs"
                        >
                          詳細を見る
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PageSection>
          )}

          {/* ====== エリア3: 他店のヘルプ状況 ====== */}
          {isAdmin && otherStoreHelpRequests.length > 0 && (
            <PageSection className="!p-0 overflow-hidden">
              <div className="bg-[#F5F5F7] px-4 sm:px-6 py-3 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#86868B]" />
                <h3 className="text-[#1D1D1F] font-semibold text-sm sm:text-base">
                  他店のヘルプ状況
                </h3>
                <Badge className="bg-[#E5E5EA] text-[#86868B] ml-auto">
                  {otherStoreHelpRequests.length}件
                </Badge>
              </div>
              <div className="p-4 sm:p-6 space-y-2">
                {otherStoreHelpRequests.slice(0, 5).map((req) => (
                  <div
                    key={req.id}
                    onClick={() => router.push(`/dashboard/help-board/${req.id}`)}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E5E5EA] hover:border-[#007AFF]/30 hover:bg-[#F5F5F7] cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                      <span className="font-medium text-sm text-[#1D1D1F]">{req.storeName}</span>
                      <span className="text-sm text-[#86868B]">
                        {formatAlertDate(req.needDate)} {req.needStart}〜{req.needEnd}
                      </span>
                      {req.status === 'open' ? (
                        <Badge className="bg-[#FF3B30]/10 text-[#FF3B30] text-[10px]">未対応</Badge>
                      ) : (
                        <Badge className="bg-[#FF9500]/10 text-[#FF9500] text-[10px]">応募あり</Badge>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#86868B] shrink-0" />
                  </div>
                ))}
                {otherStoreHelpRequests.length > 5 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/dashboard/help-board')}
                    className="w-full border-[#E5E5EA] text-[#86868B]"
                  >
                    すべてのヘルプ要請を見る ({otherStoreHelpRequests.length}件)
                  </Button>
                )}
              </div>
            </PageSection>
          )}

          {/* ====== スタッフ向け：ヘルプ求人のお知らせ ====== */}
          {isStaff && alerts.openHelpRequests.length > 0 && (
            <PageSection className="!p-0 overflow-hidden">
              <div className="bg-[#FF3B30] px-4 sm:px-6 py-3 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-white" />
                <h3 className="text-white font-semibold text-sm sm:text-base">
                  ヘルプ求人が届いています
                </h3>
                <Badge className="bg-white/20 text-white ml-auto">
                  {alerts.openHelpRequests.length}件
                </Badge>
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-1">
                <p className="text-sm text-[#86868B]">
                  以下の店舗からヘルプが来ています。スケジュールに余裕のある方は「応募する」ボタンを押してください。店長に連絡が届きます。
                </p>
              </div>
              <div className="p-4 sm:p-6 space-y-3">
                {alerts.openHelpRequests.map((req) => (
                  <div
                    key={`staff-help-${req.id}`}
                    onClick={() => router.push(`/dashboard/help-board/${req.id}`)}
                    className="flex items-center justify-between gap-3 p-4 rounded-xl border border-[#E5E5EA] hover:border-[#FF3B30]/30 hover:bg-[#FF3B30]/5 cursor-pointer transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-4 h-4 text-[#FF3B30] shrink-0" />
                        <span className="font-semibold text-sm text-[#1D1D1F]">{req.storeName}</span>
                      </div>
                      <p className="text-sm text-[#1D1D1F] ml-6">
                        {formatAlertDate(req.needDate)} {req.needStart}〜{req.needEnd}
                      </p>
                      {req.memo && (
                        <p className="text-xs text-[#86868B] ml-6 mt-1">{req.memo}</p>
                      )}
                    </div>
                    <Button size="sm" className="bg-[#FF3B30] hover:bg-[#E0352B] text-white rounded-xl shrink-0">
                      応募する
                    </Button>
                  </div>
                ))}
              </div>
            </PageSection>
          )}

          {/* ====== 最近確定したヘルプ ====== */}
          {(alerts.recentConfirmed?.length || 0) > 0 && (
            <PageSection>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-[#34C759]" />
                <h3 className="font-semibold text-sm text-[#1D1D1F]">最近のヘルプ確定</h3>
              </div>
              <div className="space-y-2">
                {alerts.recentConfirmed.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/dashboard/help-board/${item.id}`)}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F5F5F7] cursor-pointer transition-colors"
                  >
                    <Badge className="bg-[#34C759]/10 text-[#34C759] text-[10px] shrink-0">確定</Badge>
                    <span className="text-sm text-[#1D1D1F]">
                      {item.storeName} {formatAlertDate(item.needDate)} {item.needStart}〜{item.needEnd}
                    </span>
                  </div>
                ))}
              </div>
            </PageSection>
          )}
        </div>
      ) : !alertsLoading && (
        <PageSection className="mb-6">
          <div className="flex items-center gap-3 py-2">
            <div className="w-10 h-10 rounded-xl bg-[#34C759]/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[#34C759]" />
            </div>
            <div>
              <p className="font-medium text-[#1D1D1F]">対応が必要なお知らせはありません</p>
              <p className="text-sm text-[#86868B]">現在、すべて順調です</p>
            </div>
          </div>
        </PageSection>
      )}

      {/* 統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <PageSection className="!p-3 sm:!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F5F7] flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#86868B]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1D1D1F]">{weeklyStats.shiftCount}</p>
              <p className="text-xs text-[#86868B]">今週のシフト</p>
            </div>
          </div>
        </PageSection>

        <PageSection className="!p-3 sm:!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F5F7] flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#86868B]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1D1D1F]">{weeklyStats.totalTime || '0時間'}</p>
              <p className="text-xs text-[#86868B]">予定勤務時間</p>
            </div>
          </div>
        </PageSection>

        <PageSection className="!p-3 sm:!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F5F7] flex items-center justify-center">
              <CalendarOff className="w-5 h-5 text-[#86868B]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1D1D1F]">
                {timeOffRequests.filter((r) => r.status === 'pending').length}
              </p>
              <p className="text-xs text-[#86868B]">申請中</p>
            </div>
          </div>
        </PageSection>

        <PageSection className="!p-3 sm:!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F5F7] flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-[#86868B]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1D1D1F]">
                {timeOffRequests.filter((r) => r.status === 'approved').length}
              </p>
              <p className="text-xs text-[#86868B]">承認済み休み</p>
            </div>
          </div>
        </PageSection>
      </div>

      {/* クイックアクション */}
      <h2 className="text-lg font-semibold text-[#1D1D1F] mb-4">クイックアクション</h2>
      <PageGrid cols={isAdmin ? 3 : 2}>
        {isAdmin && (
          <>
            <QuickActionCard
              title="シフト作成"
              description="月別サマリー・日別ガントチャート"
              icon={Calendar}
              href="/dashboard/shifts"
              badge="管理者"
            />
            <QuickActionCard
              title="スタッフ管理"
              description="スタッフ情報・勤務可能時間の管理"
              icon={Users}
              href="/dashboard/staff"
              badge="管理者"
            />
            <QuickActionCard
              title="必要人数設定"
              description="時間帯別の必要人数を設定"
              icon={ClipboardList}
              href="/dashboard/requirements"
              badge="管理者"
            />
          </>
        )}
        <QuickActionCard
          title="マイシフト"
          description="自分のシフト・勤務時間を確認"
          icon={CalendarDays}
          href="/dashboard/my-shifts"
          badge="全員"
          badgeVariant="secondary"
        />
        <QuickActionCard
          title="休み希望"
          description="休み希望日を入力"
          icon={CalendarOff}
          href="/dashboard/time-off"
          badge="全員"
          badgeVariant="secondary"
        />
      </PageGrid>

      {/* 今週のシフト */}
      <PageSection className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D1D1F]">今週のシフト</h2>
            <p className="text-sm text-[#86868B]">
              {format(weekDays[0], 'M月d日', { locale: ja })} -{' '}
              {format(weekDays[6], 'M月d日', { locale: ja })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard/my-shifts')}
            className="border-[#E5E5EA] hover:bg-[#F5F5F7]"
          >
            詳細を見る
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-7 gap-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-28 bg-[#F5F5F7] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="sm:hidden space-y-2">
              {weekDays.map((day) => {
                const shift = getShiftForDate(day);
                const timeOff = getTimeOffForDate(day);
                const dayOfWeek = getDay(day);
                const isTodayDate = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex items-center justify-between rounded-xl border p-3 ${
                      isTodayDate
                        ? 'border-[#007AFF] bg-[#007AFF]/5 shadow-sm'
                        : 'border-[#E5E5EA] bg-white'
                    }`}
                  >
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          dayOfWeek === 0
                            ? 'text-[#FF3B30]'
                            : dayOfWeek === 6
                            ? 'text-[#007AFF]'
                            : 'text-[#1D1D1F]'
                        }`}
                      >
                        {format(day, 'M/d (E)', { locale: ja })}
                      </p>
                      {shift ? (
                        <div className="mt-1 flex items-center gap-2 text-sm text-[#1D1D1F]">
                          <span>{shift.startTime.slice(0, 5)}-{shift.endTime.slice(0, 5)}</span>
                          {shift.isHelpFromOtherStore && (
                            <Badge className="bg-[#FF9500] text-white text-[10px] px-1.5">
                              ヘルプ
                            </Badge>
                          )}
                        </div>
                      ) : timeOff ? (
                        <span
                          className={`mt-1 inline-flex rounded-lg px-2 py-1 text-xs font-medium ${
                            timeOff.status === 'approved'
                              ? 'bg-[#34C759]/10 text-[#34C759]'
                              : timeOff.status === 'pending'
                              ? 'bg-[#FF9500]/10 text-[#FF9500]'
                              : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                          }`}
                        >
                          {timeOff.status === 'approved'
                            ? '休み'
                            : timeOff.status === 'pending'
                            ? '申請中'
                            : '却下'}
                        </span>
                      ) : (
                        <span className="mt-1 text-sm text-[#D2D2D7]">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:grid grid-cols-7 gap-2">
              {weekDays.map((day) => (
                <WeekDayCell
                  key={day.toISOString()}
                  day={day}
                  shift={getShiftForDate(day)}
                  timeOff={getTimeOffForDate(day)}
                />
              ))}
            </div>
          </>
        )}

        {/* 凡例 */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-6 pt-4 border-t border-[#E5E5EA]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#007AFF] rounded" />
            <span className="text-xs text-[#86868B]">シフト</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#FF9500] rounded" />
            <span className="text-xs text-[#86868B]">ヘルプ</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#34C759]/20 border border-[#34C759]/30 rounded" />
            <span className="text-xs text-[#86868B]">休み</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#FF9500]/20 border border-[#FF9500]/30 rounded" />
            <span className="text-xs text-[#86868B]">申請中</span>
          </div>
        </div>
      </PageSection>
    </DashboardLayout>
  );
}
