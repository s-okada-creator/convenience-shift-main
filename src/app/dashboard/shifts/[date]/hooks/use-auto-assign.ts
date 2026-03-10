'use client';

import { useState, useCallback } from 'react';
import { proposeShifts, applyProposedShifts, type ShiftProposalResult } from '@/lib/auto-assign/shift-proposer';

interface UseAutoAssignProps {
  date: string;
  selectedStoreId: string;
  fetchShifts: () => Promise<void>;
}

interface UseAutoAssignReturn {
  autoAssignLoading: boolean;
  autoAssignPreviewOpen: boolean;
  setAutoAssignPreviewOpen: (open: boolean) => void;
  autoAssignResult: ShiftProposalResult | null;
  isApplyingShifts: boolean;
  handleAutoAssign: () => Promise<void>;
  handleRecalculate: () => Promise<void>;
  handleApplyShifts: () => Promise<void>;
}

export function useAutoAssign({
  date,
  selectedStoreId,
  fetchShifts,
}: UseAutoAssignProps): UseAutoAssignReturn {
  const [autoAssignLoading, setAutoAssignLoading] = useState(false);
  const [autoAssignPreviewOpen, setAutoAssignPreviewOpen] = useState(false);
  const [autoAssignResult, setAutoAssignResult] = useState<ShiftProposalResult | null>(null);
  const [isApplyingShifts, setIsApplyingShifts] = useState(false);

  const handleAutoAssign = useCallback(async () => {
    setAutoAssignLoading(true);
    try {
      const result = await proposeShifts(date, parseInt(selectedStoreId));
      setAutoAssignResult(result);
      setAutoAssignPreviewOpen(true);
    } catch (error) {
      console.error('自動割り振りエラー:', error);
    } finally {
      setAutoAssignLoading(false);
    }
  }, [date, selectedStoreId]);

  const handleRecalculate = useCallback(async () => {
    setAutoAssignLoading(true);
    try {
      const result = await proposeShifts(date, parseInt(selectedStoreId));
      setAutoAssignResult(result);
    } catch (error) {
      console.error('再計算エラー:', error);
    } finally {
      setAutoAssignLoading(false);
    }
  }, [date, selectedStoreId]);

  const handleApplyShifts = useCallback(async () => {
    if (!autoAssignResult || autoAssignResult.proposedShifts.length === 0) return;

    setIsApplyingShifts(true);
    try {
      await applyProposedShifts(date, parseInt(selectedStoreId), autoAssignResult.proposedShifts);
      await fetchShifts();
      setAutoAssignPreviewOpen(false);
      setAutoAssignResult(null);
    } catch (error) {
      console.error('シフト適用エラー:', error);
    } finally {
      setIsApplyingShifts(false);
    }
  }, [date, selectedStoreId, autoAssignResult, fetchShifts]);

  return {
    autoAssignLoading,
    autoAssignPreviewOpen,
    setAutoAssignPreviewOpen,
    autoAssignResult,
    isApplyingShifts,
    handleAutoAssign,
    handleRecalculate,
    handleApplyShifts,
  };
}
