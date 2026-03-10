'use client';

import { useMemo, useState, useCallback } from 'react';
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
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { TIME_SLOTS, timeToMinutes } from '@/lib/time-constants';
import { AutoAssignPreviewDialog } from '@/components/shifts/auto-assign-preview';
import { ApiKeySettingsDialog } from '@/components/shifts/api-key-settings';
import { useGeminiApi } from '@/hooks/use-gemini-api';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { ShiftBar, ShiftBarOverlay } from '@/components/shifts/shift-bar';

import type { DailyShiftContentProps } from './types';
import {
  useShiftData,
  useShiftUtils,
  useShiftEditing,
  useShiftDrag,
  useAutoAssign,
} from './hooks';
import {
  ShiftEditDialog,
  DateNavigation,
  LoadingSkeleton,
  ShiftLegend,
} from './components';
import { MobileShiftList } from './components/mobile-shift-list';

const formatTime = (time: string) => {
  if (!time) return '09:00';
  return time.substring(0, 5);
};

export function DailyShiftContent({ user, date, initialStoreId }: DailyShiftContentProps) {
  const router = useRouter();
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [crossStoreOpen, setCrossStoreOpen] = useState(false);
  const [crossStoreLoading, setCrossStoreLoading] = useState(false);
  const [crossStoreError, setCrossStoreError] = useState<string | null>(null);
  const [crossStoreCandidates, setCrossStoreCandidates] = useState<
    {
      staffId: number;
      name: string;
      storeId: number;
      storeName: string;
      availableFrom: string;
      availableTo: string;
      coverSlots: string[];
      employmentType: 'employee' | 'part_time';
      role: 'owner' | 'manager' | 'staff';
      skillLevel: number | null;
    }[]
  >([]);
  const [crossStoreCoverage, setCrossStoreCoverage] = useState<Record<string, number>>({});
  const [crossStoreChecked, setCrossStoreChecked] = useState(false);
  const [requestingStaffId, setRequestingStaffId] = useState<number | null>(null);
  const [requestedStaffIds, setRequestedStaffIds] = useState<Set<number>>(new Set());

  const {
    apiKey,
    isApiKeySet,
    isValidating,
    setApiKey,
    clearApiKey,
  } = useGeminiApi();

  const {
    stores,
    selectedStoreId,
    setSelectedStoreId,
    staffList,
    shifts,
    requirements,
    availabilityMap,
    loading,
    dayOfWeek,
    fetchShifts,
  } = useShiftData({ user, date, initialStoreId });

  const {
    getStaffAvailability,
    isStaffAvailable,
    getShiftForStaff,
    isOvertimeShift,
    getRequiredCountForSlot,
    getActualCountForSlot,
  } = useShiftUtils({ availabilityMap, shifts, requirements, dayOfWeek });

  const {
    editDialogOpen,
    setEditDialogOpen,
    editingStaffId,
    editStartTime,
    setEditStartTime,
    editEndTime,
    setEditEndTime,
    saving,
    editingStaff,
    editingAvailability,
    handleOpenEditDialog,
    handleSaveShift,
    handleDeleteShift,
  } = useShiftEditing({
    staffList,
    selectedStoreId,
    date,
    getShiftForStaff,
    getStaffAvailability,
    fetchShifts,
  });

  const {
    cellWidth,
    activeShift,
    setIsResizing,
    tableRef,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleShiftResize,
  } = useShiftDrag({ loading, fetchShifts });

  const {
    autoAssignLoading,
    autoAssignPreviewOpen,
    setAutoAssignPreviewOpen,
    autoAssignResult,
    isApplyingShifts,
    handleAutoAssign,
    handleRecalculate,
    handleApplyShifts,
  } = useAutoAssign({ date, selectedStoreId, fetchShifts });

  const currentDate = parseISO(date);
  const selectedStoreIdNum = selectedStoreId ? parseInt(selectedStoreId, 10) : 0;
  const canCheckCrossStore = user.role !== 'staff';

  const shortageSlots = useMemo(() => {
    return TIME_SLOTS.map((time, idx) => {
      const next = TIME_SLOTS[idx + 1];
      if (!next) return null;
      const required = getRequiredCountForSlot(time);
      const actual = getActualCountForSlot(time);
      const shortage = required - actual;
      if (required === 0 || shortage <= 0) return null;
      return { startTime: time, endTime: next, shortage };
    }).filter(Boolean) as { startTime: string; endTime: string; shortage: number }[];
  }, [getRequiredCountForSlot, getActualCountForSlot]);

  const handleResetShifts = useCallback(async () => {
    if (!selectedStoreIdNum || resetting) return;
    const confirmed = window.confirm('この日のシフトをすべて削除します。よろしいですか？');
    if (!confirmed) return;

    setResetting(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: selectedStoreIdNum,
          date,
          shifts: [],
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'シフトのリセットに失敗しました');
      }
      await fetchShifts();
    } catch (error) {
      console.error('シフトリセットエラー:', error);
      alert(error instanceof Error ? error.message : 'シフトのリセットに失敗しました');
    } finally {
      setResetting(false);
    }
  }, [selectedStoreIdNum, resetting, date, fetchShifts]);

  const handleCheckCrossStore = useCallback(async () => {
    if (!canCheckCrossStore || !selectedStoreIdNum) return;
    setCrossStoreLoading(true);
    setCrossStoreError(null);
    setCrossStoreChecked(true);

    try {
      if (shortageSlots.length === 0) {
        setCrossStoreCandidates([]);
        setCrossStoreCoverage({});
        return;
      }

      const otherStores = stores.filter((store) => store.id !== selectedStoreIdNum);
      if (otherStores.length === 0) {
        setCrossStoreCandidates([]);
        setCrossStoreCoverage({});
        if (user.role !== 'owner') {
          setCrossStoreError('他店舗へのアクセス権限がないため確認できません');
        }
        return;
      }

      const results = await Promise.all(
        otherStores.map(async (store) => {
          const [staffRes, availRes, shiftsRes, timeOffRes] = await Promise.all([
            fetch(`/api/staff?storeId=${store.id}`),
            fetch(`/api/availability?storeId=${store.id}`),
            fetch(`/api/shifts?storeId=${store.id}&startDate=${date}&endDate=${date}`),
            fetch(`/api/time-off-requests?storeId=${store.id}`),
          ]);

          if (!staffRes.ok || !availRes.ok || !shiftsRes.ok || !timeOffRes.ok) {
            return [];
          }

          const staffData: {
            id: number;
            name: string;
            employmentType: 'employee' | 'part_time';
            role: 'owner' | 'manager' | 'staff';
            skillLevel: number | null;
          }[] = await staffRes.json();
          const availabilityData: Record<string, { dayOfWeek: number; startTime: string; endTime: string }[]> =
            await availRes.json();
          const shiftData: { staffId: number }[] = await shiftsRes.json();
          const timeOffData: { staffId: number; date: string; status: string }[] = await timeOffRes.json();

          const staffWithShift = new Set(shiftData.map((s) => s.staffId));
          const staffWithOff = new Set(
            timeOffData
              .filter((t) => t.status === 'approved' && t.date === date)
              .map((t) => t.staffId)
          );

          const candidates: {
            staffId: number;
            name: string;
            storeId: number;
            storeName: string;
            availableFrom: string;
            availableTo: string;
            coverSlots: string[];
            employmentType: 'employee' | 'part_time';
            role: 'owner' | 'manager' | 'staff';
            skillLevel: number | null;
          }[] = [];

          for (const staff of staffData) {
            if (staffWithShift.has(staff.id) || staffWithOff.has(staff.id)) continue;

            const patterns = availabilityData[String(staff.id)] ?? [];
            const availability = patterns.find((p) => p.dayOfWeek === dayOfWeek);
            if (!availability) continue;

            const availableFrom = availability.startTime;
            const availableTo = availability.endTime;
            const availableFromMinutes = timeToMinutes(availableFrom);
            const availableToMinutes = timeToMinutes(availableTo);

            const coverSlots = shortageSlots
              .filter((slot) => {
                const slotStart = timeToMinutes(slot.startTime);
                const slotEnd = timeToMinutes(slot.endTime);
                return availableFromMinutes <= slotStart && availableToMinutes >= slotEnd;
              })
              .map((slot) => `${slot.startTime}-${slot.endTime}`);

            if (coverSlots.length === 0) continue;

            candidates.push({
              staffId: staff.id,
              name: staff.name,
              storeId: store.id,
              storeName: store.name,
              availableFrom,
              availableTo,
              coverSlots,
              employmentType: staff.employmentType,
              role: staff.role,
              skillLevel: staff.skillLevel,
            });
          }

          return candidates;
        })
      );

      const flatCandidates = results.flat();
      const coverage: Record<string, number> = {};
      for (const slot of shortageSlots) {
        const key = `${slot.startTime}-${slot.endTime}`;
        coverage[key] = 0;
      }
      for (const candidate of flatCandidates) {
        for (const slot of candidate.coverSlots) {
          coverage[slot] = (coverage[slot] ?? 0) + 1;
        }
      }

      setCrossStoreCandidates(flatCandidates);
      setCrossStoreCoverage(coverage);
    } catch (error) {
      console.error('他店舗スタッフ確認エラー:', error);
      setCrossStoreError('他店舗スタッフの確認に失敗しました');
    } finally {
      setCrossStoreLoading(false);
    }
  }, [
    canCheckCrossStore,
    selectedStoreIdNum,
    shortageSlots,
    stores,
    date,
    dayOfWeek,
  ]);

  const handleRequestStaff = useCallback(async (candidate: {
    staffId: number;
    name: string;
    storeId: number;
    storeName: string;
    coverSlots: string[];
  }) => {
    if (requestingStaffId !== null) return;

    setRequestingStaffId(candidate.staffId);

    try {
      const currentStore = stores.find((s) => s.id === selectedStoreIdNum);
      const response = await fetch('/api/cross-store-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStoreId: selectedStoreIdNum,
          fromStoreName: currentStore?.name ?? '不明',
          toStoreId: candidate.storeId,
          toStoreName: candidate.storeName,
          date,
          staffId: candidate.staffId,
          staffName: candidate.name,
          shortageSlots: candidate.coverSlots,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '要請の送信に失敗しました');
      }

      setRequestedStaffIds((prev) => new Set(prev).add(candidate.staffId));
      alert(`${candidate.name}さんへの要請を送信しました`);
    } catch (error) {
      console.error('要請送信エラー:', error);
      alert(error instanceof Error ? error.message : '要請の送信に失敗しました');
    } finally {
      setRequestingStaffId(null);
    }
  }, [requestingStaffId, stores, selectedStoreIdNum, date]);

  const crossStoreBody = useMemo(() => (
    <div className="space-y-3">
      {!canCheckCrossStore && (
        <div className="text-xs text-[#86868B]">
          他店舗の確認はオーナーのみ利用できます
        </div>
      )}
      {canCheckCrossStore && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckCrossStore}
            disabled={crossStoreLoading}
            className="w-full"
          >
            {crossStoreLoading ? '確認中...' : '不足を確認する'}
          </Button>

          {shortageSlots.length === 0 && crossStoreChecked && (
            <div className="text-xs text-[#34C759]">
              不足時間帯はありません
            </div>
          )}

          {crossStoreError && (
            <div className="text-xs text-[#FF3B30]">
              {crossStoreError}
            </div>
          )}

          {crossStoreChecked && shortageSlots.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#1D1D1F]">
                不足時間帯
              </div>
              <div className="space-y-1">
                {shortageSlots.map((slot) => {
                  const key = `${slot.startTime}-${slot.endTime}`;
                  const cover = crossStoreCoverage[key] ?? 0;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg bg-[#F5F5F7] px-2 py-1 text-xs"
                    >
                      <span className="text-[#1D1D1F]">
                        {key}
                      </span>
                      <span className="text-[#86868B]">
                        不足 {slot.shortage} / 候補 {cover}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {crossStoreChecked && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#1D1D1F]">
                候補スタッフ
              </div>
              {crossStoreCandidates.length === 0 ? (
                <div className="text-xs text-[#86868B]">
                  候補が見つかりません
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {crossStoreCandidates.map((candidate) => (
                    <div
                      key={`${candidate.storeId}-${candidate.staffId}`}
                      className="rounded-lg border border-[#E5E5EA] p-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#1D1D1F]">
                          {candidate.name}
                        </span>
                        <span className="text-[#86868B]">
                          {candidate.storeName}
                        </span>
                      </div>
                      <div className="text-[#86868B] mt-1">
                        役職 {candidate.role === 'owner'
                          ? 'オーナー'
                          : candidate.role === 'manager'
                            ? '店長'
                            : 'スタッフ'}
                        ・{candidate.employmentType === 'employee' ? '社員' : 'ﾊﾞｲﾄ'}
                        ・スキル {candidate.skillLevel ?? 1}
                      </div>
                      <div className="text-[#86868B] mt-1">
                        勤務可能 {candidate.availableFrom}〜{candidate.availableTo}
                      </div>
                      <div className="text-[#86868B] mt-1">
                        対応可能 {candidate.coverSlots.join(', ')}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRequestStaff(candidate)}
                        disabled={requestingStaffId !== null || requestedStaffIds.has(candidate.staffId)}
                        className="w-full mt-2 text-xs"
                      >
                        {requestedStaffIds.has(candidate.staffId)
                          ? '要請済み'
                          : requestingStaffId === candidate.staffId
                            ? '送信中...'
                            : '要請を出す'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  ), [
    canCheckCrossStore,
    crossStoreLoading,
    handleCheckCrossStore,
    shortageSlots,
    crossStoreChecked,
    crossStoreError,
    crossStoreCoverage,
    crossStoreCandidates,
    handleRequestStaff,
    requestingStaffId,
    requestedStaffIds,
  ]);

  const handleBackToMonthly = () => {
    router.push('/dashboard/shifts');
  };

  const storeSelector = useMemo(() => {
    if (user.role !== 'owner') return null;
    return (
      <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
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
  }, [user.role, selectedStoreId, stores, setSelectedStoreId]);

  const actions = useMemo(() => (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        onClick={handleBackToMonthly}
        className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        月別サマリー
      </Button>
      {storeSelector}
    </div>
  ), [storeSelector]);

  return (
    <DashboardLayout
      user={user}
      title="日別シフト編集"
      description="スタッフごとのシフトを編集"
      actions={actions}
    >
      <DateNavigation
        date={date}
        dayOfWeek={dayOfWeek}
        selectedStoreId={selectedStoreId}
        loading={loading}
        isApiKeySet={isApiKeySet}
        autoAssignLoading={autoAssignLoading}
        onAutoAssign={handleAutoAssign}
        onOpenSettings={() => setApiKeyDialogOpen(true)}
        onResetShifts={handleResetShifts}
        isResetting={resetting}
        canReset={!!selectedStoreIdNum}
      />

      <PageSection>
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToHorizontalAxis]}
            collisionDetection={pointerWithin}
          >
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-1 min-w-0">
                <div className="sm:hidden">
                  <MobileShiftList
                    staffList={staffList}
                    getShiftForStaff={getShiftForStaff}
                    getStaffAvailability={getStaffAvailability}
                    onEdit={handleOpenEditDialog}
                  />
                </div>
                <div className="hidden sm:block overflow-x-auto relative z-0">
                  <table ref={tableRef} className="w-full sm:min-w-[800px] lg:min-w-[1200px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#E5E5EA]">
                        <th className="sticky left-0 bg-white p-1 text-left text-xs font-medium text-[#86868B] w-[150px] z-[20] border-r border-[#E5E5EA]">
                          名前 / 役職
                        </th>
                        {TIME_SLOTS.map((time) => (
                          <th
                            key={time}
                            data-time-cell
                            className="p-1 text-center text-xs font-normal text-[#86868B] min-w-[40px]"
                          >
                            {time.endsWith(':00') ? time.split(':')[0] : ''}
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b border-[#E5E5EA] bg-[#F5F5F7]">
                        <td colSpan={1} className="sticky left-0 bg-[#F5F5F7] p-1 text-xs text-[#86868B] z-[20] w-[150px] border-r border-[#E5E5EA]">
                          必要人数
                        </td>
                        {TIME_SLOTS.map((time) => {
                          const required = getRequiredCountForSlot(time);
                          const actual = getActualCountForSlot(time);
                          if (required === 0) {
                            return (
                              <td key={time} className="p-1 text-center">
                                <div className="text-xs font-medium text-[#D2D2D7]">未設定</div>
                              </td>
                            );
                          }
                          const status =
                            actual >= required
                              ? 'good'
                              : actual >= required * 0.7
                                ? 'warning'
                                : 'danger';

                          return (
                            <td key={time} className="p-1 text-center">
                              <div
                                className={`text-xs font-medium ${status === 'good'
                                  ? 'text-[#34C759]'
                                  : status === 'warning'
                                    ? 'text-[#FF9500]'
                                    : 'text-[#FF3B30]'
                                  }`}
                              >
                                {actual}/{required}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((staffMember) => {
                        const availability = getStaffAvailability(staffMember.id);
                        const shift = getShiftForStaff(staffMember.id);
                        const isOvertime = isOvertimeShift(staffMember.id);

                        return (
                          <tr
                            key={staffMember.id}
                            className="border-b border-[#E5E5EA] hover:bg-[#F5F5F7]/50 transition-colors"
                          >
                            <td
                              className="sticky left-0 bg-white p-1 z-[20] w-[150px] cursor-pointer border-r border-[#E5E5EA]"
                              onClick={() => handleOpenEditDialog(staffMember.id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-medium text-[#1D1D1F] truncate">
                                      {staffMember.name}
                                    </span>
                                    {!availability && (
                                      <AlertCircle className="w-3 h-3 text-[#FF3B30] flex-shrink-0" />
                                    )}
                                  </div>
                                  <span className="text-[10px] text-[#86868B]">
                                    {staffMember.role === 'owner'
                                      ? 'オーナー'
                                      : staffMember.role === 'manager'
                                        ? '店長'
                                        : 'スタッフ'}
                                  </span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1 py-0 border-0 ${
                                    staffMember.role === 'manager'
                                      ? 'bg-[#007AFF]/10 text-[#007AFF]'
                                      : 'bg-[#F5F5F7] text-[#86868B]'
                                  }`}
                                >
                                  {staffMember.employmentType === 'employee' ? '社員' : 'ﾊﾞｲﾄ'}
                                </Badge>
                              </div>
                            </td>
                            <td
                              colSpan={TIME_SLOTS.length}
                              className="p-0 h-5 relative"
                            >
                              <div className="absolute inset-0 flex">
                                {TIME_SLOTS.map((time) => {
                                  const isAvailable = isStaffAvailable(staffMember.id, time);
                                  return (
                                    <div
                                      key={time}
                                      className={`flex-1 h-full cursor-pointer transition-colors ${isAvailable
                                        ? 'bg-[#34C759]/20 hover:bg-[#34C759]/30'
                                        : 'bg-[#F5F5F7] hover:bg-[#E5E5EA]'
                                        }`}
                                      onClick={() => handleOpenEditDialog(staffMember.id, time)}
                                    />
                                  );
                                })}
                              </div>
                              {shift && (
                                <ShiftBar
                                  id={`shift-${shift.id}`}
                                  shiftId={shift.id}
                                  staffId={staffMember.id}
                                  startTime={formatTime(shift.startTime)}
                                  endTime={formatTime(shift.endTime)}
                                  isOvertime={isOvertime}
                                  cellWidth={cellWidth}
                                  timeSlots={TIME_SLOTS}
                                  onUpdate={handleShiftResize}
                                  onResizeStart={() => setIsResizing(true)}
                                  onResizeEnd={() => setIsResizing(false)}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="hidden sm:block">
                  <ShiftLegend />
                </div>
              </div>

              <aside className="w-full shrink-0 lg:w-auto lg:relative">
                <div className="lg:sticky lg:top-4">
                  {/* デスクトップ: 右端タブ + スライドサイドバー */}
                  <div className="hidden lg:block relative">
                    {/* タブボタン（常に表示） */}
                    {!crossStoreOpen && (
                      <button
                        type="button"
                        onClick={() => setCrossStoreOpen(true)}
                        className="flex items-center justify-center h-28 w-8 rounded-l-xl border border-[#E5E5EA] bg-[#F5F5F7] text-[11px] text-[#1D1D1F] hover:bg-white transition-colors"
                        style={{ writingMode: 'vertical-rl' }}
                      >
                        他店舗スタッフ
                      </button>
                    )}
                    {/* 開いた時のパネル */}
                    {crossStoreOpen && (
                      <div className="w-80 rounded-xl border border-[#E5E5EA] bg-white p-4 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setCrossStoreOpen(false)}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <div>
                            <p className="text-xs text-[#86868B]">タブ</p>
                            <p className="text-sm font-semibold text-[#1D1D1F]">
                              他店舗スタッフで充足確認
                            </p>
                          </div>
                          <span className="text-xs text-[#86868B]">閉じる</span>
                        </button>
                        <div className="mt-3">
                          {crossStoreBody}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* モバイル: 従来の開閉表示 */}
                  <div className="lg:hidden rounded-xl border border-[#E5E5EA] bg-white p-4">
                    {!crossStoreOpen ? (
                      <button
                        type="button"
                        onClick={() => setCrossStoreOpen(true)}
                        className="w-full flex items-center justify-between rounded-full border border-[#E5E5EA] bg-[#F5F5F7] px-3 py-1 text-xs text-[#1D1D1F] hover:bg-white transition-colors"
                      >
                        <span>他店舗スタッフで充足確認</span>
                        <span className="text-[#86868B]">開く</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCrossStoreOpen(false)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="text-xs text-[#86868B]">タブ</p>
                          <p className="text-sm font-semibold text-[#1D1D1F]">
                            他店舗スタッフで充足確認
                          </p>
                        </div>
                        <span className="text-xs text-[#86868B]">閉じる</span>
                      </button>
                    )}
                    <div
                      className={`transition-all duration-300 ease-out overflow-hidden ${
                        crossStoreOpen ? 'max-h-[720px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'
                      }`}
                    >
                      {crossStoreBody}
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            <DragOverlay modifiers={[restrictToHorizontalAxis]}>
              {activeShift && (
                <ShiftBarOverlay
                  startTime={activeShift.startTime}
                  endTime={activeShift.endTime}
                  isOvertime={
                    timeToMinutes(activeShift.endTime) - timeToMinutes(activeShift.startTime) > 8 * 60
                  }
                  cellWidth={cellWidth}
                  timeSlots={TIME_SLOTS}
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </PageSection>

      <ShiftEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editingStaff={editingStaff}
        editingAvailability={editingAvailability}
        editStartTime={editStartTime}
        setEditStartTime={setEditStartTime}
        editEndTime={editEndTime}
        setEditEndTime={setEditEndTime}
        saving={saving}
        existingShift={editingStaffId ? getShiftForStaff(editingStaffId) : undefined}
        onSave={handleSaveShift}
        onDelete={handleDeleteShift}
      />

      <ApiKeySettingsDialog
        open={apiKeyDialogOpen}
        onOpenChange={setApiKeyDialogOpen}
        currentApiKey={apiKey}
        isValidating={isValidating}
        onSave={setApiKey}
        onClear={clearApiKey}
      />

      <AutoAssignPreviewDialog
        open={autoAssignPreviewOpen}
        onOpenChange={setAutoAssignPreviewOpen}
        date={format(currentDate, 'yyyy年M月d日', { locale: ja })}
        beforeCoverage={autoAssignResult?.beforeCoverage ?? 0}
        afterCoverage={autoAssignResult?.afterCoverage ?? 0}
        proposedShifts={autoAssignResult?.proposedShifts ?? []}
        unfilledSlots={autoAssignResult?.unfilledSlots ?? []}
        isLoading={autoAssignLoading}
        isApplying={isApplyingShifts}
        onRecalculate={handleRecalculate}
        onApply={handleApplyShifts}
      />
    </DashboardLayout>
  );
}
