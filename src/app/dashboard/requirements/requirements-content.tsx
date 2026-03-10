'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Copy,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle,
  Users,
  Sparkles,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { TIME_SLOTS, timeToMinutes } from '@/lib/time-constants';

// コンビニのおすすめ必要人数設定（時間帯別）
function getRecommendedCount(timeSlot: string): number {
  const hour = parseInt(timeSlot.split(':')[0], 10);

  // 深夜 (0:00-6:00): 2人
  if (hour >= 0 && hour < 6) return 2;
  // 早朝ラッシュ (6:00-9:00): 3人
  if (hour >= 6 && hour < 9) return 3;
  // 午前 (9:00-12:00): 2人
  if (hour >= 9 && hour < 12) return 2;
  // ランチタイム (12:00-14:00): 3人
  if (hour >= 12 && hour < 14) return 3;
  // 午後 (14:00-17:00): 2人
  if (hour >= 14 && hour < 17) return 2;
  // 夕方ラッシュ (17:00-21:00): 3人
  if (hour >= 17 && hour < 21) return 3;
  // 夜 (21:00-24:00): 2人
  return 2;
}

interface Store {
  id: number;
  name: string;
}

interface ShiftRequirement {
  id: number;
  storeId: number;
  dayOfWeek: number;
  timeSlot: string;
  requiredCount: number;
}

interface RequirementsContentProps {
  user: SessionUser;
}

const dayOfWeekLabels = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
const dayOfWeekShortLabels = ['日', '月', '火', '水', '木', '金', '土'];

// ローディングスケルトン
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="h-20 bg-[#E5E5EA] rounded-xl" />
        ))}
      </div>
    </div>
  );
});

// 時間スロットカード
const TimeSlotCard = memo(function TimeSlotCard({
  timeSlot,
  count,
  onIncrement,
  onDecrement,
}: {
  timeSlot: string;
  count: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const getBgColor = (count: number): string => {
    if (count === 0) return 'bg-[#F5F5F7]';
    if (count === 1) return 'bg-[#007AFF]/10';
    if (count === 2) return 'bg-[#007AFF]/20';
    if (count === 3) return 'bg-[#007AFF]/30';
    return 'bg-[#007AFF]/40';
  };

  return (
    <div
      className={`p-3 rounded-xl border border-[#E5E5EA] ${getBgColor(count)} transition-colors duration-200`}
    >
      <div className="text-sm font-medium text-[#1D1D1F] mb-2 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-[#86868B]" />
        {timeSlot}
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 rounded-lg border-[#E5E5EA] hover:bg-[#F5F5F7]"
          onClick={onDecrement}
        >
          -
        </Button>
        <span className="text-lg font-semibold text-[#1D1D1F] w-8 text-center">
          {count}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 rounded-lg border-[#E5E5EA] hover:bg-[#F5F5F7]"
          onClick={onIncrement}
        >
          +
        </Button>
      </div>
    </div>
  );
});

// 週間サマリーカード
const WeeklySummaryCard = memo(function WeeklySummaryCard({
  label,
  index,
  totalSlots,
  totalStaff,
}: {
  label: string;
  index: number;
  totalSlots: number;
  totalStaff: number;
}) {
  return (
    <div
      className={`p-3 rounded-xl border transition-all duration-200 ${
        totalSlots > 0
          ? 'border-[#007AFF]/30 bg-[#007AFF]/5'
          : 'border-[#E5E5EA] bg-[#F5F5F7]'
      }`}
    >
      <div
        className={`text-sm font-semibold mb-2 ${
          index === 0
            ? 'text-[#FF3B30]'
            : index === 6
            ? 'text-[#007AFF]'
            : 'text-[#1D1D1F]'
        }`}
      >
        {label}
      </div>
      <div className="text-xs text-[#86868B]">
        {totalSlots > 0 ? (
          <>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {totalSlots}枠
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Users className="w-3 h-3" />
              計{totalStaff}人
            </div>
          </>
        ) : (
          <div className="text-[#D2D2D7]">未設定</div>
        )}
      </div>
    </div>
  );
});

// 週間サマリーコンポーネント
const WeeklySummary = memo(function WeeklySummary({ storeId }: { storeId: string }) {
  const [weeklyData, setWeeklyData] = useState<Map<number, ShiftRequirement[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (storeId) {
      fetchWeeklyData();
    }
  }, [storeId]);

  const fetchWeeklyData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shift-requirements?storeId=${storeId}`);
      if (res.ok) {
        const data: ShiftRequirement[] = await res.json();
        const grouped = new Map<number, ShiftRequirement[]>();
        for (let i = 0; i < 7; i++) {
          grouped.set(i, data.filter((r) => r.dayOfWeek === i));
        }
        setWeeklyData(grouped);
      }
    } catch (error) {
      console.error('週間データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-7 gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-20 bg-[#E5E5EA] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {dayOfWeekShortLabels.map((label, index) => {
        const dayRequirements = weeklyData.get(index) || [];
        const totalSlots = dayRequirements.length;
        const totalStaff = dayRequirements.reduce((acc, r) => acc + r.requiredCount, 0);

        return (
          <WeeklySummaryCard
            key={index}
            label={label}
            index={index}
            totalSlots={totalSlots}
            totalStaff={totalStaff}
          />
        );
      })}
    </div>
  );
});

export function RequirementsContent({ user }: RequirementsContentProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(1);
  const [requirements, setRequirements] = useState<Map<string, number>>(new Map());
  const [baselineRequirements, setBaselineRequirements] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const serializeRequirements = useCallback((map: Map<string, number>) => {
    const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  }, []);

  const requirementsKey = useMemo(
    () => serializeRequirements(requirements),
    [requirements, serializeRequirements]
  );
  const baselineKey = useMemo(
    () => serializeRequirements(baselineRequirements),
    [baselineRequirements, serializeRequirements]
  );
  const hasChanges = requirementsKey !== baselineKey;

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

  const fetchRequirements = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/shift-requirements?storeId=${selectedStoreId}&dayOfWeek=${selectedDayOfWeek}`
      );
      if (res.ok) {
        const data: ShiftRequirement[] = await res.json();
        const reqMap = new Map<string, number>();
        data.forEach((r) => {
          reqMap.set(r.timeSlot, r.requiredCount);
        });
        setRequirements(reqMap);
        setBaselineRequirements(reqMap);
      }
    } catch (error) {
      console.error('必要人数取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, selectedDayOfWeek]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (selectedStoreId) {
      fetchRequirements();
    }
  }, [selectedStoreId, selectedDayOfWeek, fetchRequirements]);

  const handleRequirementChange = useCallback((timeSlot: string, count: number) => {
    setRequirements((prev) => {
      const newRequirements = new Map(prev);
      if (count <= 0) {
        newRequirements.delete(timeSlot);
      } else {
        newRequirements.set(timeSlot, count);
      }
      return newRequirements;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const requirementsArray = Array.from(requirements.entries())
        .filter(([_, count]) => count > 0)
        .map(([timeSlot, requiredCount]) => ({
          timeSlot,
          requiredCount,
        }));

      const res = await fetch('/api/shift-requirements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: parseInt(selectedStoreId),
          dayOfWeek: selectedDayOfWeek,
          requirements: requirementsArray,
        }),
      });

      if (res.ok) {
        setBaselineRequirements(new Map(requirements));
        alert('保存しました');
      } else {
        const error = await res.json();
        alert(error.error || '保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [requirements, selectedStoreId, selectedDayOfWeek]);

  const handleCopyToOtherDays = useCallback(async (targetDays: number[]) => {
    if (!confirm(`選択した曜日に現在の設定をコピーしますか？\n対象: ${targetDays.map(d => dayOfWeekLabels[d]).join(', ')}`)) {
      return;
    }

    setSaving(true);
    try {
      const requirementsArray = Array.from(requirements.entries())
        .filter(([_, count]) => count > 0)
        .map(([timeSlot, requiredCount]) => ({
          timeSlot,
          requiredCount,
        }));

      for (const day of targetDays) {
        const res = await fetch('/api/shift-requirements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: parseInt(selectedStoreId),
            dayOfWeek: day,
            requirements: requirementsArray,
          }),
        });
        if (!res.ok) {
          const error = await res.json().catch(() => null);
          throw new Error(error?.error || 'コピーに失敗しました');
        }
      }

      alert('コピーしました');
    } catch (error) {
      console.error('コピーエラー:', error);
      alert(error instanceof Error ? error.message : 'コピーに失敗しました');
    } finally {
      setSaving(false);
    }
  }, [requirements, selectedStoreId]);

  const handleClear = useCallback(() => {
    if (confirm('すべての時間帯をクリアしますか？')) {
      setRequirements(new Map());
    }
  }, []);

  const handleApplyRecommended = useCallback(() => {
    if (confirm('おすすめ設定を適用しますか？\n\n時間帯別の標準的な人数配置に設定されます。')) {
      const newRequirements = new Map<string, number>();
      for (const timeSlot of TIME_SLOTS) {
        newRequirements.set(timeSlot, getRecommendedCount(timeSlot));
      }
      setRequirements(newRequirements);
    }
  }, []);

  const handleApplyRecommendedToAllDays = useCallback(async () => {
    if (!confirm('おすすめ設定を全曜日に適用しますか？\n\n全ての曜日に標準的な人数配置が設定されます。')) {
      return;
    }

    setSaving(true);
    try {
      const requirementsArray = TIME_SLOTS.map((timeSlot) => ({
        timeSlot,
        requiredCount: getRecommendedCount(timeSlot),
      }));

      for (let day = 0; day < 7; day++) {
        const res = await fetch('/api/shift-requirements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: parseInt(selectedStoreId),
            dayOfWeek: day,
            requirements: requirementsArray,
          }),
        });
        if (!res.ok) {
          const error = await res.json().catch(() => null);
          throw new Error(error?.error || 'おすすめ設定の適用に失敗しました');
        }
      }

      // 現在表示中の曜日も更新
      const newRequirements = new Map<string, number>();
      for (const timeSlot of TIME_SLOTS) {
        newRequirements.set(timeSlot, getRecommendedCount(timeSlot));
      }
      setRequirements(newRequirements);
      setBaselineRequirements(newRequirements);
      alert('全曜日におすすめ設定を適用しました');
    } catch (error) {
      console.error('おすすめ設定適用エラー:', error);
      alert(error instanceof Error ? error.message : '適用に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [selectedStoreId]);

  const handleStoreChange = useCallback((value: string) => {
    setSelectedStoreId(value);
  }, []);

  const handleDayChange = useCallback((value: string) => {
    setSelectedDayOfWeek(parseInt(value));
  }, []);

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
      title="必要人数設定"
      description="曜日・時間帯ごとに必要なスタッフ人数を設定"
      actions={storeSelector}
    >
      {/* 時間帯別必要人数 */}
      <PageSection>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D1D1F]">時間帯別必要人数</h2>
            <p className="text-sm text-[#86868B]">
              各時間帯に必要なスタッフ人数を設定してください
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge className="bg-[#FF9500]/10 text-[#FF9500] border-0">
                <AlertCircle className="w-3 h-3 mr-1" />
                未保存
              </Badge>
            )}
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl"
            >
              {saving ? (
                <>保存中...</>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" />
                  保存
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 曜日タブ */}
        <Tabs
          value={selectedDayOfWeek.toString()}
          onValueChange={handleDayChange}
          className="mb-6"
        >
          <TabsList className="grid grid-cols-7 w-full bg-[#F5F5F7] p-1 rounded-xl">
            {dayOfWeekShortLabels.map((label, index) => (
              <TabsTrigger
                key={index}
                value={index.toString()}
                className={`rounded-lg text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm ${
                  index === 0
                    ? 'data-[state=active]:text-[#FF3B30] text-[#FF3B30]/60'
                    : index === 6
                    ? 'data-[state=active]:text-[#007AFF] text-[#007AFF]/60'
                    : 'data-[state=active]:text-[#1D1D1F] text-[#86868B]'
                }`}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* 時間帯グリッド */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-6">
              {TIME_SLOTS.map((timeSlot) => {
                const count = requirements.get(timeSlot) || 0;
                return (
                  <TimeSlotCard
                    key={timeSlot}
                    timeSlot={timeSlot}
                    count={count}
                    onIncrement={() => handleRequirementChange(timeSlot, count + 1)}
                    onDecrement={() => handleRequirementChange(timeSlot, Math.max(0, count - 1))}
                  />
                );
              })}
            </div>

            {/* 一括操作 */}
            <div className="border-t border-[#E5E5EA] pt-4">
              <h4 className="text-sm font-medium text-[#1D1D1F] mb-3 flex items-center gap-2">
                <Copy className="w-4 h-4 text-[#86868B]" />
                一括操作
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyRecommended}
                  disabled={saving}
                  className="rounded-lg border-[#007AFF] text-[#007AFF] hover:bg-[#007AFF]/5"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  おすすめ設定
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyRecommendedToAllDays}
                  disabled={saving}
                  className="rounded-lg border-[#007AFF] text-[#007AFF] hover:bg-[#007AFF]/5"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  全曜日におすすめ設定
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToOtherDays([1, 2, 3, 4, 5])}
                  disabled={saving}
                  className="rounded-lg border-[#E5E5EA] hover:bg-[#F5F5F7]"
                >
                  平日（月〜金）にコピー
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToOtherDays([0, 6])}
                  disabled={saving}
                  className="rounded-lg border-[#E5E5EA] hover:bg-[#F5F5F7]"
                >
                  土日にコピー
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToOtherDays([0, 1, 2, 3, 4, 5, 6].filter(d => d !== selectedDayOfWeek))}
                  disabled={saving}
                  className="rounded-lg border-[#E5E5EA] hover:bg-[#F5F5F7]"
                >
                  全曜日にコピー
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  className="rounded-lg border-[#E5E5EA] text-[#FF3B30] hover:bg-[#FF3B30]/5 hover:text-[#FF3B30]"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  クリア
                </Button>
              </div>
            </div>

            {/* 凡例 */}
            <div className="border-t border-[#E5E5EA] pt-4 mt-4">
              <h4 className="text-sm font-medium text-[#1D1D1F] mb-3">凡例</h4>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-[#F5F5F7] border border-[#E5E5EA] rounded-lg" />
                  <span className="text-sm text-[#86868B]">0人</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-[#007AFF]/10 border border-[#E5E5EA] rounded-lg" />
                  <span className="text-sm text-[#86868B]">1人</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-[#007AFF]/20 border border-[#E5E5EA] rounded-lg" />
                  <span className="text-sm text-[#86868B]">2人</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-[#007AFF]/30 border border-[#E5E5EA] rounded-lg" />
                  <span className="text-sm text-[#86868B]">3人</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-[#007AFF]/40 border border-[#E5E5EA] rounded-lg" />
                  <span className="text-sm text-[#86868B]">4人以上</span>
                </div>
              </div>
            </div>
          </>
        )}
      </PageSection>

      {/* 週間サマリー */}
      <PageSection className="mt-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[#1D1D1F] flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-[#34C759]" />
            週間サマリー
          </h2>
          <p className="text-sm text-[#86868B]">各曜日の設定状況を確認できます</p>
        </div>
        <WeeklySummary storeId={selectedStoreId} />
      </PageSection>
    </DashboardLayout>
  );
}
