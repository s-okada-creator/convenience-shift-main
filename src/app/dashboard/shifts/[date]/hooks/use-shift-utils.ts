'use client';

import { useCallback } from 'react';
import { timeToMinutes } from '@/lib/time-constants';
import type { Shift, ShiftRequirement, AvailabilityPattern } from '../types';

interface UseShiftUtilsProps {
  availabilityMap: Map<number, AvailabilityPattern[]>;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  dayOfWeek: number;
}

export function useShiftUtils({
  availabilityMap,
  shifts,
  requirements,
  dayOfWeek,
}: UseShiftUtilsProps) {
  const getStaffAvailability = useCallback((staffId: number) => {
    const patterns = availabilityMap.get(staffId) || [];
    return patterns.find((p) => p.dayOfWeek === dayOfWeek);
  }, [availabilityMap, dayOfWeek]);

  const isStaffAvailable = useCallback((staffId: number, time: string) => {
    const availability = getStaffAvailability(staffId);
    if (!availability) return false;

    const timeMin = timeToMinutes(time);
    const startMin = timeToMinutes(availability.startTime);
    const endMin = timeToMinutes(availability.endTime);

    return timeMin >= startMin && timeMin < endMin;
  }, [getStaffAvailability]);

  const getShiftForStaff = useCallback((staffId: number) => {
    return shifts.find((s) => s.staffId === staffId);
  }, [shifts]);

  const isTimeInShift = useCallback((staffId: number, time: string) => {
    const shift = getShiftForStaff(staffId);
    if (!shift) return false;

    const timeMin = timeToMinutes(time);
    const startMin = timeToMinutes(shift.startTime);
    const endMin = timeToMinutes(shift.endTime);

    return timeMin >= startMin && timeMin < endMin;
  }, [getShiftForStaff]);

  const isOvertimeShift = useCallback((staffId: number) => {
    const shift = getShiftForStaff(staffId);
    if (!shift) return false;

    const startMin = timeToMinutes(shift.startTime);
    const endMin = timeToMinutes(shift.endTime);
    const durationMinutes = endMin - startMin;

    return durationMinutes > 8 * 60;
  }, [getShiftForStaff]);

  const getRequiredCountForSlot = useCallback((time: string) => {
    const req = requirements.find((r) => r.timeSlot === time);
    return req?.requiredCount || 0;
  }, [requirements]);

  const getActualCountForSlot = useCallback((time: string) => {
    return shifts.filter((s) => {
      const timeMin = timeToMinutes(time);
      const startMin = timeToMinutes(s.startTime);
      const endMin = timeToMinutes(s.endTime);
      return timeMin >= startMin && timeMin < endMin;
    }).length;
  }, [shifts]);

  return {
    getStaffAvailability,
    isStaffAvailable,
    getShiftForStaff,
    isTimeInShift,
    isOvertimeShift,
    getRequiredCountForSlot,
    getActualCountForSlot,
  };
}
