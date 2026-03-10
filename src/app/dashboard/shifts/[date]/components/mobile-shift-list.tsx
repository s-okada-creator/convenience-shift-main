'use client';

import { memo } from 'react';
import type { AvailabilityPattern, Shift, Staff } from '../types';

interface MobileShiftListProps {
  staffList: Staff[];
  getShiftForStaff: (staffId: number) => Shift | undefined;
  getStaffAvailability: (staffId: number) => AvailabilityPattern | undefined;
  onEdit: (staffId: number) => void;
}

const formatTime = (time?: string | null) => {
  if (!time) return '';
  return time.substring(0, 5);
};

export const MobileShiftList = memo(function MobileShiftList({
  staffList,
  getShiftForStaff,
  getStaffAvailability,
  onEdit,
}: MobileShiftListProps) {
  return (
    <div className="space-y-2">
      {staffList.map((staff) => {
        const shift = getShiftForStaff(staff.id);
        const availability = getStaffAvailability(staff.id);
        const hasShift = !!shift;
        const shiftLabel = hasShift
          ? `${formatTime(shift?.startTime)}-${formatTime(shift?.endTime)}`
          : '未設定';
        const availabilityLabel = availability
          ? `${formatTime(availability.startTime)}-${formatTime(availability.endTime)}`
          : '未登録';

        return (
          <button
            key={staff.id}
            type="button"
            onClick={() => onEdit(staff.id)}
            className={`touch-target w-full rounded-xl border p-4 text-left transition-colors ${
              hasShift
                ? 'border-[#E5E5EA] bg-white hover:border-[#007AFF]/50'
                : 'border-[#E5E5EA] bg-[#F5F5F7] text-[#86868B]'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-base font-semibold ${hasShift ? 'text-[#1D1D1F]' : 'text-[#86868B]'}`}>
                {staff.name}
              </p>
              <span className={`text-xs ${hasShift ? 'text-[#007AFF]' : 'text-[#86868B]'}`}>
                シフト {shiftLabel}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#86868B]">勤務可能時間帯 {availabilityLabel}</p>
          </button>
        );
      })}
    </div>
  );
});
