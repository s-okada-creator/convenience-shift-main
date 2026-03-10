'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DragEndEvent,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { TIME_SLOTS, getTimeSlotIndex } from '@/lib/time-constants';
import type { ActiveShift } from '../types';

interface UseShiftDragProps {
  loading: boolean;
  fetchShifts: () => Promise<void>;
}

interface UseShiftDragReturn {
  cellWidth: number;
  activeShift: ActiveShift | null;
  isResizing: boolean;
  setIsResizing: (value: boolean) => void;
  tableRef: React.RefObject<HTMLTableElement | null>;
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
  handleShiftResize: (shiftId: number, newStartTime: string, newEndTime: string) => Promise<void>;
}

export function useShiftDrag({ loading, fetchShifts }: UseShiftDragProps): UseShiftDragReturn {
  const [cellWidth, setCellWidth] = useState(40);
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 5,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  useEffect(() => {
    const measureCellWidth = () => {
      if (tableRef.current) {
        const cell = tableRef.current.querySelector('[data-time-cell]');
        if (cell) {
          const rect = cell.getBoundingClientRect();
          setCellWidth(rect.width);
        }
      }
    };

    measureCellWidth();
    window.addEventListener('resize', measureCellWidth);
    return () => window.removeEventListener('resize', measureCellWidth);
  }, [loading]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.type === 'shift') {
      setActiveShift({
        shiftId: data.shiftId,
        staffId: data.staffId,
        startTime: data.startTime,
        endTime: data.endTime,
      });
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, delta } = event;
    const data = active.data.current;

    setActiveShift(null);

    if (!data || data.type !== 'shift') return;

    const cellsMoved = Math.round(delta.x / cellWidth);
    if (cellsMoved === 0) return;

    const { shiftId, startTime, endTime } = data;

    const startIndex = getTimeSlotIndex(startTime, TIME_SLOTS);
    const endIndex = getTimeSlotIndex(endTime, TIME_SLOTS);

    let newStartIndex = startIndex + cellsMoved;
    let newEndIndex = endIndex + cellsMoved;

    if (newStartIndex < 0) {
      newStartIndex = 0;
      newEndIndex = endIndex - startIndex;
    }
    if (newEndIndex > TIME_SLOTS.length) {
      newEndIndex = TIME_SLOTS.length;
      newStartIndex = TIME_SLOTS.length - (endIndex - startIndex);
    }

    const newStartTime = TIME_SLOTS[newStartIndex];
    const newEndTime = TIME_SLOTS[newEndIndex] || '24:00';

    if (newStartTime === startTime && newEndTime === endTime) return;

    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: newStartTime,
          endTime: newEndTime,
        }),
      });

      if (res.ok) {
        await fetchShifts();
      }
    } catch (error) {
      console.error('シフト更新エラー:', error);
    }
  }, [cellWidth, fetchShifts]);

  const handleShiftResize = useCallback(async (shiftId: number, newStartTime: string, newEndTime: string) => {
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: newStartTime,
          endTime: newEndTime,
        }),
      });

      if (res.ok) {
        await fetchShifts();
      }
    } catch (error) {
      console.error('シフト更新エラー:', error);
    }
  }, [fetchShifts]);

  return {
    cellWidth,
    activeShift,
    isResizing,
    setIsResizing,
    tableRef,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleShiftResize,
  };
}
