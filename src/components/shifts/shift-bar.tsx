'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { getTimeSlotIndex, timeToMinutes } from '@/lib/time-constants';

interface ShiftBarProps {
  id: string;
  shiftId: number;
  staffId: number;
  startTime: string;
  endTime: string;
  isOvertime: boolean;
  cellWidth: number;
  timeSlots: string[];
  onUpdate: (shiftId: number, startTime: string, endTime: string) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

export function ShiftBar({
  id,
  shiftId,
  staffId,
  startTime,
  endTime,
  isOvertime,
  cellWidth,
  timeSlots,
  onUpdate,
  onResizeStart,
  onResizeEnd,
}: ShiftBarProps) {
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [tempStartTime, setTempStartTime] = useState(startTime);
  const [tempEndTime, setTempEndTime] = useState(endTime);
  const barRef = useRef<HTMLDivElement>(null);
  const tempStartTimeRef = useRef(tempStartTime);
  const tempEndTimeRef = useRef(tempEndTime);
  const rafRef = useRef<number | null>(null);
  const pendingStartIndexRef = useRef<number | null>(null);
  const pendingEndIndexRef = useRef<number | null>(null);
  const cleanupResizeListenersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    tempStartTimeRef.current = tempStartTime;
  }, [tempStartTime]);

  useEffect(() => {
    tempEndTimeRef.current = tempEndTime;
  }, [tempEndTime]);

  const cleanupResizeListeners = useCallback(() => {
    if (cleanupResizeListenersRef.current) {
      cleanupResizeListenersRef.current();
      cleanupResizeListenersRef.current = null;
    }
  }, []);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelRaf();
    };
  }, [cancelRaf]);

  useEffect(() => cleanupResizeListeners, [cleanupResizeListeners]);

  // ドラッグ可能設定
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: {
      type: 'shift',
      shiftId,
      staffId,
      startTime,
      endTime,
    },
    disabled: isResizing !== null,
  });

  // 位置計算
  const startIndex = Math.max(0, getTimeSlotIndex(startTime, timeSlots));
  const endIndex = Math.max(startIndex, getTimeSlotIndex(endTime, timeSlots));
  const displayStartIndex = Math.max(0, getTimeSlotIndex(tempStartTime, timeSlots));
  const displayEndIndex = Math.max(displayStartIndex, getTimeSlotIndex(tempEndTime, timeSlots));

  const left = (isResizing ? displayStartIndex : startIndex) * cellWidth;
  const width = ((isResizing ? displayEndIndex : endIndex) - (isResizing ? displayStartIndex : startIndex)) * cellWidth;

  // ドラッグ中のスタイル
  const style = {
    transform: CSS.Translate.toString(transform),
    left: `${left}px`,
    width: `${width}px`,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging || isResizing ? 50 : 10,
  };

  // リサイズ開始
  const handleResizeStart = useCallback((side: 'left' | 'right', e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setIsResizing(side);
    setTempStartTime(startTime);
    setTempEndTime(endTime);
    onResizeStart?.();

    cleanupResizeListeners();

    const startX = e.clientX;
    const currentStartIndex = Math.max(0, getTimeSlotIndex(startTime, timeSlots));
    const currentEndIndex = Math.max(currentStartIndex, getTimeSlotIndex(endTime, timeSlots));
    const minEndIndex = currentStartIndex + 4; // 最小2時間
    const maxStartIndex = currentEndIndex - 4; // 最小2時間

    const scheduleUpdate = () => {
      if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (pendingStartIndexRef.current !== null) {
            setTempStartTime(timeSlots[pendingStartIndexRef.current]);
            pendingStartIndexRef.current = null;
          }
          if (pendingEndIndexRef.current !== null) {
            setTempEndTime(timeSlots[pendingEndIndexRef.current] || '24:00');
            pendingEndIndexRef.current = null;
          }
        });
    };

    const handlePointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX;
      const cellsMoved = Math.round(deltaX / cellWidth);

      if (side === 'left') {
        let newStartIndex = currentStartIndex + cellsMoved;
        newStartIndex = Math.max(0, Math.min(maxStartIndex, newStartIndex));
        if (newStartIndex >= 0 && newStartIndex < timeSlots.length) {
          if (pendingStartIndexRef.current !== newStartIndex) {
            pendingStartIndexRef.current = newStartIndex;
            scheduleUpdate();
          }
        }
      } else {
        let newEndIndex = currentEndIndex + cellsMoved;
        newEndIndex = Math.max(minEndIndex, Math.min(timeSlots.length, newEndIndex));
        if (newEndIndex > 0 && newEndIndex <= timeSlots.length) {
          if (pendingEndIndexRef.current !== newEndIndex) {
            pendingEndIndexRef.current = newEndIndex;
            scheduleUpdate();
          }
        }
      }
    };

    const handlePointerUp = () => {
      cancelRaf();
      if (pendingStartIndexRef.current !== null) {
        setTempStartTime(timeSlots[pendingStartIndexRef.current]);
        pendingStartIndexRef.current = null;
      }
      if (pendingEndIndexRef.current !== null) {
        setTempEndTime(timeSlots[pendingEndIndexRef.current] || '24:00');
        pendingEndIndexRef.current = null;
      }
      const latestStart = tempStartTimeRef.current;
      const latestEnd = tempEndTimeRef.current;
      if (latestStart !== startTime || latestEnd !== endTime) {
        onUpdate(shiftId, latestStart, latestEnd);
      }
      setIsResizing(null);
      onResizeEnd?.();
      cleanupResizeListeners();
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    cleanupResizeListenersRef.current = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [startTime, endTime, timeSlots, cellWidth, onResizeStart, onResizeEnd, onUpdate, shiftId, cleanupResizeListeners, cancelRaf]);

  // シフト時間の計算（8時間超で残業判定）
  const duration = timeToMinutes(isResizing ? tempEndTime : endTime) - timeToMinutes(isResizing ? tempStartTime : startTime);
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const displayOvertime = duration > 8 * 60;

  // 8時間以内と8時間超過の幅を計算
  const normalMinutes = Math.min(duration, 8 * 60);
  const overtimeMinutes = Math.max(0, duration - 8 * 60);
  const normalWidthPercent = (normalMinutes / duration) * 100;
  const overtimeWidthPercent = (overtimeMinutes / duration) * 100;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (barRef) (barRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      className={`absolute top-0.5 bottom-0.5 flex items-center cursor-grab active:cursor-grabbing select-none transition-shadow ${
        isDragging ? 'shadow-lg' : ''
      } ${isResizing ? 'cursor-ew-resize' : ''}`}
      {...attributes}
      {...listeners}
    >
      {/* バー本体 */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-full rounded-md overflow-hidden pointer-events-none">
        <div className="absolute inset-0 flex">
          <div
            className="h-full bg-[#007AFF]"
            style={{ width: `${normalWidthPercent}%` }}
          />
          {displayOvertime && (
            <div
              className="h-full bg-[#FF9500]"
              style={{ width: `${overtimeWidthPercent}%` }}
            />
          )}
        </div>
        <div
          className={`absolute inset-0 rounded-md ${
            displayOvertime
              ? 'shadow-[0_0_0_1px_rgba(255,149,0,0.35)]'
              : 'shadow-[0_0_0_1px_rgba(0,122,255,0.35)]'
          }`}
        />
      </div>

      {/* 左リサイズハンドル */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-md flex items-center justify-center z-10 touch-none"
        onPointerDown={(e) => handleResizeStart('left', e)}
      >
        <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2 bg-white/60 rounded" />
      </div>

      {/* 中央コンテンツ */}
      <div className="flex-1 flex items-center justify-center gap-1 px-2 min-w-0 z-10">
        <GripVertical className="w-3 h-3 text-white/70 flex-shrink-0" />
        <span className="text-[10px] text-white font-medium truncate">
          {isResizing ? tempStartTime : startTime}-{isResizing ? tempEndTime : endTime}
        </span>
        {width > 120 && (
          <span className="text-[9px] text-white/80 flex-shrink-0">
            ({hours}h{mins > 0 ? `${mins}m` : ''})
          </span>
        )}
      </div>

      {/* 右リサイズハンドル */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-md flex items-center justify-center z-10 touch-none"
        onPointerDown={(e) => handleResizeStart('right', e)}
      >
        <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2 bg-white/60 rounded" />
      </div>
    </div>
  );
}

// ドラッグオーバーレイ用コンポーネント
export function ShiftBarOverlay({
  startTime,
  endTime,
  isOvertime,
  cellWidth,
  timeSlots,
}: {
  startTime: string;
  endTime: string;
  isOvertime: boolean;
  cellWidth: number;
  timeSlots: string[];
}) {
  const startIndex = Math.max(0, getTimeSlotIndex(startTime, timeSlots));
  const endIndex = Math.max(startIndex, getTimeSlotIndex(endTime, timeSlots));
  const width = (endIndex - startIndex) * cellWidth;

  const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;

  // 8時間以内と8時間超過の幅を計算
  const normalMinutes = Math.min(duration, 8 * 60);
  const overtimeMinutes = Math.max(0, duration - 8 * 60);
  const normalWidthPercent = (normalMinutes / duration) * 100;
  const overtimeWidthPercent = (overtimeMinutes / duration) * 100;

  return (
    <div
      style={{ width: `${width}px` }}
      className="h-4 flex items-center justify-center px-2 shadow-lg relative"
    >
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-full rounded-md overflow-hidden">
        <div className="absolute inset-0 flex">
          <div
            className="h-full bg-[#007AFF]"
            style={{ width: `${normalWidthPercent}%` }}
          />
          {isOvertime && (
            <div
              className="h-full bg-[#FF9500]"
              style={{ width: `${overtimeWidthPercent}%` }}
            />
          )}
        </div>
      </div>
      <div className="relative z-10 flex items-center">
        <GripVertical className="w-3 h-3 text-white/70" />
        <span className="text-[10px] text-white font-medium ml-1">
          {startTime}-{endTime}
        </span>
        {width > 100 && (
          <span className="text-[9px] text-white/80 ml-1">
            ({hours}h{mins > 0 ? `${mins}m` : ''})
          </span>
        )}
      </div>
    </div>
  );
}
