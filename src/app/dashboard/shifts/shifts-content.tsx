'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  TrendingUp,
  Clock,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface Store {
  id: number;
  name: string;
}

interface Shift {
  id: number;
  staffId: number;
  storeId: number;
  date: string;
  startTime: string;
  endTime: string;
  staffName: string | null;
  staffRole: string | null;
  staffEmploymentType: string | null;
}

interface ShiftRequirement {
  id: number;
  storeId: number;
  dayOfWeek: number;
  timeSlot: string;
  requiredCount: number;
}

interface ShiftsContentProps {
  user: SessionUser;
}

const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];

// ローディングスケルトン
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1 animate-pulse">
      {[...Array(35)].map((_, i) => (
        <div key={i} className="h-16 sm:h-20 lg:h-24 bg-[#E5E5EA] rounded-xl" />
      ))}
    </div>
  );
});

// 統計カード
const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#1D1D1F]">{value}</p>
          <p className="text-xs text-[#86868B]">{label}</p>
        </div>
      </div>
    </div>
  );
});

// カレンダー日付セル
const CalendarDayCell = memo(function CalendarDayCell({
  day,
  shiftCount,
  requiredCount,
  onClick,
}: {
  day: Date;
  shiftCount: number;
  requiredCount: number;
  onClick: () => void;
}) {
  const dayOfWeek = getDay(day);
  const isTodayDate = isToday(day);

  const getStatus = (): 'good' | 'warning' | 'danger' | 'none' => {
    if (requiredCount === 0) return 'none';
    if (shiftCount >= requiredCount) return 'good';
    if (shiftCount >= requiredCount * 0.7) return 'warning';
    return 'danger';
  };

  const status = getStatus();

  const statusColors = {
    good: 'bg-[#34C759]',
    warning: 'bg-[#FF9500]',
    danger: 'bg-[#FF3B30]',
    none: '',
  };

  const badgeColors = {
    good: 'border-[#34C759]/30 text-[#34C759] bg-[#34C759]/10',
    warning: 'border-[#FF9500]/30 text-[#FF9500] bg-[#FF9500]/10',
    danger: 'border-[#FF3B30]/30 text-[#FF3B30] bg-[#FF3B30]/10',
    none: 'border-[#E5E5EA] text-[#86868B] bg-[#F5F5F7]',
  };

  return (
    <div
      onClick={onClick}
      className={`h-16 sm:h-20 lg:h-24 p-2 border rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md ${
        isTodayDate
          ? 'border-[#007AFF] bg-[#007AFF]/5'
          : 'border-[#E5E5EA] hover:border-[#007AFF] bg-white'
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`text-sm font-semibold ${
            dayOfWeek === 0
              ? 'text-[#FF3B30]'
              : dayOfWeek === 6
              ? 'text-[#007AFF]'
              : 'text-[#1D1D1F]'
          }`}
        >
          {format(day, 'd')}
        </span>
        {status !== 'none' && (
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
        )}
      </div>
      <div className="mt-2">
        {shiftCount > 0 ? (
          <Badge variant="outline" className={`text-xs ${badgeColors[status]}`}>
            <span className="sm:hidden">{shiftCount}/{requiredCount}</span>
            <span className="hidden sm:inline">{shiftCount}名/{requiredCount}名</span>
          </Badge>
        ) : requiredCount > 0 ? (
          <Badge variant="outline" className="text-xs border-[#E5E5EA] text-[#D2D2D7] bg-[#F5F5F7]">
            未設定
          </Badge>
        ) : null}
      </div>
    </div>
  );
});

export function ShiftsContent({ user }: ShiftsContentProps) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requirements, setRequirements] = useState<ShiftRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data);
        if (data.length > 0) {
          const defaultStore = user.storeId
            ? data.find((s: Store) => s.id === user.storeId)
            : data[0];
          setSelectedStoreId((defaultStore?.id || data[0].id).toString());
        }
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  }, [user.storeId]);

  const fetchShifts = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);

    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    try {
      const res = await fetch(
        `/api/shifts?storeId=${selectedStoreId}&startDate=${start}&endDate=${end}`
      );
      if (res.ok) {
        const data = await res.json();
        setShifts(data);
      }
    } catch (error) {
      console.error('シフト取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, currentMonth]);

  const fetchRequirements = useCallback(async () => {
    if (!selectedStoreId) return;

    try {
      const res = await fetch(`/api/shift-requirements?storeId=${selectedStoreId}`);
      if (res.ok) {
        const data = await res.json();
        setRequirements(data);
      }
    } catch (error) {
      console.error('必要人数取得エラー:', error);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (selectedStoreId) {
      fetchShifts();
      fetchRequirements();
    }
  }, [selectedStoreId, currentMonth, fetchShifts, fetchRequirements]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    const startDayOfWeek = getDay(start);
    const emptyDays = Array(startDayOfWeek).fill(null);

    return [...emptyDays, ...days];
  }, [currentMonth]);

  const shiftCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    shifts.forEach((s) => {
      map.set(s.date, (map.get(s.date) || 0) + 1);
    });
    return map;
  }, [shifts]);

  const requiredCountByDay = useMemo(() => {
    const map = new Map<number, number>();
    requirements.forEach((r) => {
      const prev = map.get(r.dayOfWeek) || 0;
      if (r.requiredCount > prev) {
        map.set(r.dayOfWeek, r.requiredCount);
      }
    });
    return map;
  }, [requirements]);

  const getShiftCountForDate = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shiftCountByDate.get(dateStr) || 0;
  }, [shiftCountByDate]);

  const getRequiredCountForDate = useCallback((date: Date) => {
    const dayOfWeek = getDay(date);
    return requiredCountByDay.get(dayOfWeek) || 0;
  }, [requiredCountByDay]);

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prev) => subMonths(prev, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  }, []);

  const handleDateClick = useCallback((date: Date) => {
    router.push(`/dashboard/shifts/${format(date, 'yyyy-MM-dd')}?storeId=${selectedStoreId}`);
  }, [router, selectedStoreId]);

  const handleStoreChange = useCallback((value: string) => {
    setSelectedStoreId(value);
  }, []);

  const stats = useMemo(() => {
    const totalShifts = shifts.length;
    const daysWithShifts = new Set(shifts.map((s) => s.date)).size;
    const uniqueStaff = new Set(shifts.map((s) => s.staffId)).size;
    const today = new Date();
    const monthEnd = endOfMonth(currentMonth);
    const remainingDays = today > monthEnd
      ? 0
      : eachDayOfInterval({
        start: today,
        end: monthEnd,
      }).length;

    return { totalShifts, daysWithShifts, uniqueStaff, remainingDays };
  }, [shifts, currentMonth]);

  const storeSelector = useMemo(() => {
    if (user.role !== 'owner') return null;
    return (
      <Select value={selectedStoreId} onValueChange={handleStoreChange}>
        <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white">
          <SelectValue placeholder="店舗を選択" />
        </SelectTrigger>
        <SelectContent>
          {stores.map((store) => (
            <SelectItem key={store.id} value={store.id.toString()}>
              {store.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }, [user.role, selectedStoreId, stores, handleStoreChange]);

  return (
    <DashboardLayout
      user={user}
      title="シフト作成"
      description="月別サマリーと日別編集"
      actions={storeSelector}
    >
      {/* カレンダー */}
      <PageSection>
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            onClick={handlePrevMonth}
            className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            前月
          </Button>
          <h2 className="text-xl font-semibold text-[#1D1D1F]">
            {format(currentMonth, 'yyyy年M月', { locale: ja })}
          </h2>
          <Button
            variant="outline"
            onClick={handleNextMonth}
            className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
          >
            翌月
            <ChevronRight className="w-4 h-4 ml-1" />
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

        {/* カレンダー本体 */}
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="h-16 sm:h-20 lg:h-24" />;
              }

              if (!isSameMonth(day, currentMonth)) {
                return <div key={day.toISOString()} className="h-16 sm:h-20 lg:h-24 opacity-30" />;
              }

              return (
                <CalendarDayCell
                  key={day.toISOString()}
                  day={day}
                  shiftCount={getShiftCountForDate(day)}
                  requiredCount={getRequiredCountForDate(day)}
                  onClick={() => handleDateClick(day)}
                />
              );
            })}
          </div>
        )}

        {/* 凡例 */}
        <div className="flex flex-wrap items-center gap-6 mt-6 pt-4 border-t border-[#E5E5EA]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#34C759]" />
            <span className="text-sm text-[#86868B]">充足</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FF9500]" />
            <span className="text-sm text-[#86868B]">やや不足</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FF3B30]" />
            <span className="text-sm text-[#86868B]">不足</span>
          </div>
        </div>
      </PageSection>

      {/* 月間統計 */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard
          icon={Calendar}
          label="総シフト数"
          value={stats.totalShifts}
          color="bg-[#007AFF]"
        />
        <StatCard
          icon={TrendingUp}
          label="シフト入力済み日数"
          value={`${stats.daysWithShifts}日`}
          color="bg-[#34C759]"
        />
        <StatCard
          icon={Users}
          label="登録スタッフ数"
          value={`${stats.uniqueStaff}名`}
          color="bg-[#FF9500]"
        />
        <StatCard
          icon={Clock}
          label="今月の残り日数"
          value={`${stats.remainingDays}日`}
          color="bg-[#5856D6]"
        />
      </div>
    </DashboardLayout>
  );
}
