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

const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];

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

  const isAdmin = user.role === 'owner' || user.role === 'manager';

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

  useEffect(() => {
    fetchWeeklyData();
  }, [fetchWeeklyData]);

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
