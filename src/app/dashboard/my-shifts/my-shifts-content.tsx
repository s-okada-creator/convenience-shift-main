'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameMonth,
  isToday,
  parseISO,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface Shift {
  id: number;
  staffId: number;
  storeId: number;
  date: string;
  startTime: string;
  endTime: string;
  isHelpFromOtherStore: boolean | null;
  createdAt: string;
  storeName: string | null;
}

interface TimeOffRequest {
  id: number;
  staffId: number;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface StaffInfo {
  id: number;
  name: string;
  hourlyRate: number;
  storeId: number;
  storeName: string | null;
}

interface MyShiftsContentProps {
  user: SessionUser;
}

const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];

const timeOffStatusLabels: Record<string, string> = {
  pending: '申請中',
  approved: '承認済',
  rejected: '却下',
};

function calculateWorkMinutes(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  return endHour * 60 + endMin - (startHour * 60 + startMin);
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}時間${mins > 0 ? `${mins}分` : ''}`;
}

function formatShortHour(time: string): string {
  const hour = parseInt(time.substring(0, 2), 10);
  if (Number.isNaN(hour)) return time.substring(0, 2);
  return `${hour}`;
}

function formatShortRange(start: string, end: string): string {
  return `${formatShortHour(start)}-${formatShortHour(end)}`;
}

const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <PageSection className="!p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#1D1D1F]">{value}</p>
          <p className="text-xs text-[#86868B]">{label}</p>
        </div>
      </div>
    </PageSection>
  );
});

const CalendarDayCell = memo(function CalendarDayCell({
  day,
  currentMonth,
  shift,
  timeOff,
}: {
  day: Date | null;
  currentMonth: Date;
  shift?: Shift;
  timeOff?: TimeOffRequest;
}) {
  if (!day) {
    return <div className="h-14 sm:h-20 lg:h-24" />;
  }

  const dayOfWeek = getDay(day);
  const isTodayDate = isToday(day);

  return (
    <div
      className={`h-14 sm:h-20 lg:h-24 p-2 border rounded-xl transition-all ${
        isTodayDate
          ? 'border-[#007AFF] bg-[#007AFF]/5 shadow-sm'
          : 'border-[#E5E5EA] hover:border-[#D2D2D7]'
      } ${!isSameMonth(day, currentMonth) ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`text-sm font-medium ${
            dayOfWeek === 0
              ? 'text-[#FF3B30]'
              : dayOfWeek === 6
              ? 'text-[#007AFF]'
              : 'text-[#1D1D1F]'
          }`}
        >
          {format(day, 'd')}
        </span>
      </div>
      {shift && (
        <div className="mt-1 p-1.5 bg-gradient-to-br from-[#007AFF] to-[#5856D6] text-white rounded-lg text-xs">
          <div className="font-medium sm:hidden">
            {formatShortRange(shift.startTime, shift.endTime)}
          </div>
          <div className="hidden sm:block font-medium">
            {shift.startTime.slice(0, 5)}-{shift.endTime.slice(0, 5)}
          </div>
          {shift.isHelpFromOtherStore && (
            <Badge className="mt-0.5 bg-[#FF9500] text-white text-[10px] px-1">
              ヘルプ
            </Badge>
          )}
        </div>
      )}
      {timeOff && !shift && (
        <Badge
          className={`mt-1 text-xs ${
            timeOff.status === 'approved'
              ? 'bg-[#34C759]/10 text-[#34C759]'
              : timeOff.status === 'pending'
              ? 'bg-[#FF9500]/10 text-[#FF9500]'
              : 'bg-[#FF3B30]/10 text-[#FF3B30]'
          }`}
        >
          {timeOffStatusLabels[timeOff.status]}
        </Badge>
      )}
    </div>
  );
});

const WeekDayRow = memo(function WeekDayRow({
  day,
  shift,
  timeOff,
  staffInfo,
}: {
  day: Date;
  shift?: Shift;
  timeOff?: TimeOffRequest;
  staffInfo: StaffInfo | null;
}) {
  const dayOfWeek = getDay(day);
  const isTodayDate = isToday(day);
  const workMinutes = shift ? calculateWorkMinutes(shift.startTime, shift.endTime) : 0;

  return (
    <div
      className={`flex items-center p-4 rounded-xl border transition-all ${
        isTodayDate
          ? 'border-[#007AFF] bg-[#007AFF]/5 shadow-sm'
          : 'border-[#E5E5EA] bg-white hover:border-[#D2D2D7]'
      }`}
    >
      <div className="w-24">
        <div
          className={`text-sm font-medium ${
            dayOfWeek === 0
              ? 'text-[#FF3B30]'
              : dayOfWeek === 6
              ? 'text-[#007AFF]'
              : 'text-[#1D1D1F]'
          }`}
        >
          {format(day, 'M/d (E)', { locale: ja })}
        </div>
      </div>
      <div className="flex-1 ml-4">
        {shift ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-[#1D1D1F] sm:hidden">
                {formatShortRange(shift.startTime, shift.endTime)}
              </span>
              <span className="hidden sm:block text-lg font-semibold text-[#1D1D1F]">
                {shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)}
              </span>
              {shift.isHelpFromOtherStore && (
                <Badge className="bg-[#FF9500] text-white">ヘルプ</Badge>
              )}
            </div>
            <span className="text-[#86868B]">({formatMinutes(workMinutes)})</span>
          </div>
        ) : timeOff ? (
          <Badge
            className={
              timeOff.status === 'approved'
                ? 'bg-[#34C759]/10 text-[#34C759]'
                : timeOff.status === 'pending'
                ? 'bg-[#FF9500]/10 text-[#FF9500]'
                : 'bg-[#FF3B30]/10 text-[#FF3B30]'
            }
          >
            休み {timeOffStatusLabels[timeOff.status]}
          </Badge>
        ) : (
          <span className="text-[#86868B]">シフトなし</span>
        )}
      </div>
      {shift && staffInfo && (
        <div className="text-right">
          <span className="text-sm font-medium text-[#1D1D1F]">
            ¥{Math.round((workMinutes / 60) * staffInfo.hourlyRate).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
});

const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-2">
      {[...Array(35)].map((_, i) => (
        <div key={i} className="h-14 sm:h-20 lg:h-24 bg-[#F5F5F7] rounded-xl animate-pulse" />
      ))}
    </div>
  );
});

export function MyShiftsContent({ user }: MyShiftsContentProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [shiftSheetOpen, setShiftSheetOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedShiftDate, setSelectedShiftDate] = useState<Date | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMyShifts = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      const res = await fetch(`/api/my-shifts?startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts);
        setTimeOffRequests(data.timeOffRequests);
        setStaffInfo(data.staffInfo);
      }
    } catch (error) {
      console.error('マイシフト取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchMyShifts();
  }, [fetchMyShifts]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const startDayOfWeek = getDay(start);
    const emptyDays: (Date | null)[] = Array(startDayOfWeek).fill(null);
    return [...emptyDays, ...days];
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentWeek, { weekStartsOn: 0 });
    const end = endOfWeek(currentWeek, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentWeek]);

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

  const monthlyStats = useMemo(() => {
    const totalMinutes = shifts.reduce((acc, shift) => {
      return acc + calculateWorkMinutes(shift.startTime, shift.endTime);
    }, 0);
    const shiftCount = shifts.length;
    const estimatedPay = staffInfo ? Math.round((totalMinutes / 60) * staffInfo.hourlyRate) : 0;
    return { totalMinutes, shiftCount, estimatedPay };
  }, [shifts, staffInfo]);

  const handlePrevMonth = useCallback(() => setCurrentMonth((m) => subMonths(m, 1)), []);
  const handleNextMonth = useCallback(() => setCurrentMonth((m) => addMonths(m, 1)), []);
  const handlePrevWeek = useCallback(() => setCurrentWeek((w) => subWeeks(w, 1)), []);
  const handleNextWeek = useCallback(() => setCurrentWeek((w) => addWeeks(w, 1)), []);

  const handleOpenShiftSheet = useCallback((day: Date) => {
    const shift = getShiftForDate(day);
    if (!shift) return;
    setSelectedShift(shift);
    setSelectedShiftDate(day);
    setShiftSheetOpen(true);
  }, [getShiftForDate]);

  const handleShiftSheetChange = useCallback((open: boolean) => {
    setShiftSheetOpen(open);
    if (!open) {
      setSelectedShift(null);
      setSelectedShiftDate(null);
    }
  }, []);

  return (
    <>
    <DashboardLayout
      user={user}
      title="マイシフト"
      description={`${staffInfo?.storeName || '所属店舗'} - ${user.name}`}
    >
      {/* 月間サマリー */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Calendar}
          label="今月の勤務回数"
          value={`${monthlyStats.shiftCount}回`}
          color="bg-[#007AFF]/10 text-[#007AFF]"
        />
        <StatCard
          icon={Clock}
          label="今月の勤務時間"
          value={formatMinutes(monthlyStats.totalMinutes)}
          color="bg-[#34C759]/10 text-[#34C759]"
        />
        <StatCard
          icon={Wallet}
          label="今月の見込み給与"
          value={`¥${monthlyStats.estimatedPay.toLocaleString()}`}
          color="bg-[#FF9500]/10 text-[#FF9500]"
        />
        <StatCard
          icon={TrendingUp}
          label="時給"
          value={`¥${staffInfo?.hourlyRate.toLocaleString() || '-'}`}
          color="bg-[#5856D6]/10 text-[#5856D6]"
        />
      </div>

      <Tabs defaultValue="month" className="space-y-4">
        <TabsList className="bg-[#E5E5EA]/50 p-1 rounded-xl">
          <TabsTrigger value="month" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            月表示
          </TabsTrigger>
          <TabsTrigger value="week" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            週表示
          </TabsTrigger>
          <TabsTrigger value="list" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            リスト
          </TabsTrigger>
        </TabsList>

        {/* 月表示 */}
        <TabsContent value="month">
          <PageSection>
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevMonth}
                className="hover:bg-[#F5F5F7]"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                前月
              </Button>
              <h3 className="text-xl font-semibold text-[#1D1D1F]">
                {format(currentMonth, 'yyyy年M月', { locale: ja })}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextMonth}
                className="hover:bg-[#F5F5F7]"
              >
                翌月
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>

            {/* カレンダーヘッダー */}
            <div className="grid grid-cols-7 mb-2">
              {dayOfWeekLabels.map((day, index) => (
                <div
                  key={day}
                  className={`text-center py-2 text-sm font-medium ${
                    index === 0 ? 'text-[#FF3B30]' : index === 6 ? 'text-[#007AFF]' : 'text-[#86868B]'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {loading ? (
              <LoadingSkeleton />
            ) : (
              <>
                <div className="grid grid-cols-7 gap-2 sm:hidden">
                  {calendarDays.map((day, index) => {
                    if (!day) {
                      return <div key={`empty-${index}`} className="h-14" />;
                    }
                    const dayOfWeek = getDay(day);
                    const isTodayDate = isToday(day);
                    const isInMonth = isSameMonth(day, currentMonth);
                    const shift = getShiftForDate(day);
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => shift && handleOpenShiftSheet(day)}
                        disabled={!shift}
                        className={`h-14 rounded-xl border p-2 text-left transition-all ${
                          isTodayDate
                            ? 'border-[#007AFF] bg-[#007AFF]/5 shadow-sm'
                            : 'border-[#E5E5EA] bg-white'
                        } ${!isInMonth ? 'opacity-50' : ''} ${
                          shift ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <span
                            className={`text-sm font-medium ${
                              dayOfWeek === 0
                                ? 'text-[#FF3B30]'
                                : dayOfWeek === 6
                                ? 'text-[#007AFF]'
                                : 'text-[#1D1D1F]'
                            }`}
                          >
                            {format(day, 'd')}
                          </span>
                          {shift && <span className="h-2 w-2 rounded-full bg-[#007AFF]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="hidden sm:grid grid-cols-7 gap-2">
                  {calendarDays.map((day, index) => (
                    <CalendarDayCell
                      key={day ? day.toISOString() : `empty-${index}`}
                      day={day}
                      currentMonth={currentMonth}
                      shift={day ? getShiftForDate(day) : undefined}
                      timeOff={day ? getTimeOffForDate(day) : undefined}
                    />
                  ))}
                </div>
              </>
            )}

            {/* 凡例 */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-6 pt-4 border-t border-[#E5E5EA]">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gradient-to-br from-[#007AFF] to-[#5856D6] rounded" />
                <span className="text-xs text-[#86868B]">シフト</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-[#FF9500] rounded" />
                <span className="text-xs text-[#86868B]">ヘルプ</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-[#FF9500]/20 border border-[#FF9500]/30 rounded" />
                <span className="text-xs text-[#86868B]">休み申請中</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-[#34C759]/20 border border-[#34C759]/30 rounded" />
                <span className="text-xs text-[#86868B]">休み承認済</span>
              </div>
            </div>
          </PageSection>
        </TabsContent>

        {/* 週表示 */}
        <TabsContent value="week">
          <PageSection>
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevWeek}
                className="hover:bg-[#F5F5F7]"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                前週
              </Button>
              <h3 className="text-xl font-semibold text-[#1D1D1F]">
                {format(weekDays[0], 'M月d日', { locale: ja })} -{' '}
                {format(weekDays[6], 'M月d日', { locale: ja })}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextWeek}
                className="hover:bg-[#F5F5F7]"
              >
                翌週
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-16 bg-[#F5F5F7] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {weekDays.map((day) => (
                  <WeekDayRow
                    key={day.toISOString()}
                    day={day}
                    shift={getShiftForDate(day)}
                    timeOff={getTimeOffForDate(day)}
                    staffInfo={staffInfo}
                  />
                ))}
              </div>
            )}
          </PageSection>
        </TabsContent>

        {/* リスト表示 */}
        <TabsContent value="list">
          <PageSection>
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevMonth}
                className="hover:bg-[#F5F5F7]"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                前月
              </Button>
              <h3 className="text-xl font-semibold text-[#1D1D1F]">
                {format(currentMonth, 'yyyy年M月', { locale: ja })}のシフト
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextMonth}
                className="hover:bg-[#F5F5F7]"
              >
                翌月
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-[#F5F5F7] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : shifts.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-[#D2D2D7] mx-auto mb-4" />
                <p className="text-[#86868B]">今月のシフトはありません</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...shifts]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((shift) => {
                    const workMinutes = calculateWorkMinutes(shift.startTime, shift.endTime);
                    const date = parseISO(shift.date);
                    const isTodayDate = isToday(date);

                    return (
                      <div
                        key={shift.id}
                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                          isTodayDate
                            ? 'border-[#007AFF] bg-[#007AFF]/5 shadow-sm'
                            : 'border-[#E5E5EA] bg-white hover:border-[#D2D2D7]'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-28">
                            <div className="text-sm font-medium text-[#1D1D1F]">
                              {format(date, 'M月d日 (E)', { locale: ja })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-semibold text-[#1D1D1F] sm:hidden">
                              {formatShortRange(shift.startTime, shift.endTime)}
                            </span>
                            <span className="hidden sm:block text-lg font-semibold text-[#1D1D1F]">
                              {shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)}
                            </span>
                            {shift.isHelpFromOtherStore && (
                              <Badge className="bg-[#FF9500] text-white">ヘルプ</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-[#86868B]">{formatMinutes(workMinutes)}</div>
                          {staffInfo && (
                            <div className="text-sm font-medium text-[#1D1D1F]">
                              ¥{Math.round((workMinutes / 60) * staffInfo.hourlyRate).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </PageSection>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
    <Dialog open={shiftSheetOpen} onOpenChange={handleShiftSheetChange}>
      <DialogContent
        className="sm:hidden bottom-0 top-auto left-0 right-0 translate-x-0 translate-y-0 rounded-t-2xl border-[#E5E5EA] p-4 pb-safe max-w-none"
      >
        <DialogHeader className="text-left">
          <DialogTitle>シフト詳細</DialogTitle>
          <DialogDescription>
            {selectedShiftDate
              ? format(selectedShiftDate, 'M月d日 (E)', { locale: ja })
              : ''}
          </DialogDescription>
        </DialogHeader>
        {selectedShift ? (
          <div className="mt-2 rounded-xl border border-[#E5E5EA] bg-white p-4 text-center">
            <p className="text-sm text-[#86868B]">勤務時間</p>
            <p className="mt-2 text-xl font-semibold text-[#1D1D1F]">
              {selectedShift.startTime.slice(0, 5)} - {selectedShift.endTime.slice(0, 5)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#86868B]">シフトはありません</p>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
