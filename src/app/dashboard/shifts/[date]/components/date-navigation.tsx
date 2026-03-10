'use client';

import { memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageSection } from '@/components/layout/dashboard-layout';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AutoAssignButton } from '@/components/shifts/auto-assign-button';
import { dayOfWeekLabels } from '../types';

interface DateNavigationProps {
  date: string;
  dayOfWeek: number;
  selectedStoreId: string;
  loading: boolean;
  isApiKeySet: boolean;
  autoAssignLoading: boolean;
  onAutoAssign: () => Promise<void>;
  onOpenSettings: () => void;
  onResetShifts: () => void;
  isResetting: boolean;
  canReset: boolean;
}

export const DateNavigation = memo(function DateNavigation({
  date,
  dayOfWeek,
  selectedStoreId,
  loading,
  isApiKeySet,
  autoAssignLoading,
  onAutoAssign,
  onOpenSettings,
  onResetShifts,
  isResetting,
  canReset,
}: DateNavigationProps) {
  const router = useRouter();
  const currentDate = parseISO(date);

  const handlePrevDay = useCallback(() => {
    router.push(
      `/dashboard/shifts/${format(subDays(currentDate, 1), 'yyyy-MM-dd')}?storeId=${selectedStoreId}`
    );
  }, [router, currentDate, selectedStoreId]);

  const handleNextDay = useCallback(() => {
    router.push(
      `/dashboard/shifts/${format(addDays(currentDate, 1), 'yyyy-MM-dd')}?storeId=${selectedStoreId}`
    );
  }, [router, currentDate, selectedStoreId]);

  return (
    <PageSection className="mb-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
        <Button
          variant="outline"
          onClick={handlePrevDay}
          className="w-full sm:w-auto rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          前日
        </Button>
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-2xl sm:text-xl font-semibold text-[#1D1D1F] text-center">
            {format(currentDate, 'yyyy年M月d日', { locale: ja })}
            <span
              className={`ml-2 ${dayOfWeek === 0
                ? 'text-[#FF3B30]'
                : dayOfWeek === 6
                  ? 'text-[#007AFF]'
                  : 'text-[#86868B]'
                }`}
            >
              ({dayOfWeekLabels[dayOfWeek]})
            </span>
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <AutoAssignButton
              onAutoAssign={onAutoAssign}
              onOpenSettings={onOpenSettings}
              isLoading={autoAssignLoading}
              isApiKeySet={isApiKeySet}
              disabled={loading}
            />
            <Button
              variant="outline"
              onClick={onResetShifts}
              disabled={!canReset || isResetting}
              className="border-[#FF3B30]/30 text-[#FF3B30] hover:bg-[#FF3B30]/5"
            >
              {isResetting ? 'リセット中...' : '当日のシフトをリセット'}
            </Button>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleNextDay}
          className="w-full sm:w-auto rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
        >
          翌日
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </PageSection>
  );
});
