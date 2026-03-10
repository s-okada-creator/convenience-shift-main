'use client';

import { useState, useCallback, useMemo } from 'react';
import { addHoursToTime, DEFAULT_SHIFT } from '@/lib/time-constants';
import type { Staff, Shift, AvailabilityPattern } from '../types';

interface UseShiftEditingProps {
  staffList: Staff[];
  selectedStoreId: string;
  date: string;
  getShiftForStaff: (staffId: number) => Shift | undefined;
  getStaffAvailability: (staffId: number) => AvailabilityPattern | undefined;
  fetchShifts: () => Promise<void>;
}

interface UseShiftEditingReturn {
  editDialogOpen: boolean;
  setEditDialogOpen: (open: boolean) => void;
  editingStaffId: number | null;
  editStartTime: string;
  setEditStartTime: (time: string) => void;
  editEndTime: string;
  setEditEndTime: (time: string) => void;
  saving: boolean;
  editingStaff: Staff | undefined;
  editingAvailability: AvailabilityPattern | null;
  handleOpenEditDialog: (staffId: number, clickedTime?: string) => void;
  handleSaveShift: () => Promise<void>;
  handleDeleteShift: () => Promise<void>;
}

const formatTime = (time: string) => {
  if (!time) return '09:00';
  return time.substring(0, 5);
};

export function useShiftEditing({
  staffList,
  selectedStoreId,
  date,
  getShiftForStaff,
  getStaffAvailability,
  fetchShifts,
}: UseShiftEditingProps): UseShiftEditingReturn {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);

  const handleOpenEditDialog = useCallback((staffId: number, clickedTime?: string) => {
    const existingShift = getShiftForStaff(staffId);
    const availability = getStaffAvailability(staffId);

    setEditingStaffId(staffId);
    if (existingShift) {
      setEditStartTime(formatTime(existingShift.startTime));
      setEditEndTime(formatTime(existingShift.endTime));
    } else if (clickedTime) {
      setEditStartTime(clickedTime);
      setEditEndTime(addHoursToTime(clickedTime, DEFAULT_SHIFT.duration));
    } else if (availability) {
      setEditStartTime(formatTime(availability.startTime));
      setEditEndTime(formatTime(availability.endTime));
    } else {
      setEditStartTime(DEFAULT_SHIFT.startTime);
      setEditEndTime(DEFAULT_SHIFT.endTime);
    }
    setEditDialogOpen(true);
  }, [getShiftForStaff, getStaffAvailability]);

  const handleSaveShift = useCallback(async () => {
    if (!editingStaffId) return;

    setSaving(true);
    try {
      const existingShift = getShiftForStaff(editingStaffId);

      if (existingShift) {
        const res = await fetch(`/api/shifts/${existingShift.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startTime: editStartTime,
            endTime: editEndTime,
          }),
        });

        if (res.ok) {
          await fetchShifts();
        }
      } else {
        const res = await fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staffId: editingStaffId,
            storeId: parseInt(selectedStoreId),
            date,
            startTime: editStartTime,
            endTime: editEndTime,
          }),
        });

        if (res.ok) {
          await fetchShifts();
        }
      }

      setEditDialogOpen(false);
    } catch (error) {
      console.error('シフト保存エラー:', error);
    } finally {
      setSaving(false);
    }
  }, [editingStaffId, editStartTime, editEndTime, selectedStoreId, date, getShiftForStaff, fetchShifts]);

  const handleDeleteShift = useCallback(async () => {
    if (!editingStaffId) return;

    const existingShift = getShiftForStaff(editingStaffId);
    if (!existingShift) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/shifts/${existingShift.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchShifts();
        setEditDialogOpen(false);
      }
    } catch (error) {
      console.error('シフト削除エラー:', error);
    } finally {
      setSaving(false);
    }
  }, [editingStaffId, getShiftForStaff, fetchShifts]);

  const editingStaff = useMemo(
    () => staffList.find((s) => s.id === editingStaffId),
    [staffList, editingStaffId]
  );

  const editingAvailability = useMemo(
    () => editingStaffId ? getStaffAvailability(editingStaffId) ?? null : null,
    [editingStaffId, getStaffAvailability]
  );

  return {
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
  };
}
