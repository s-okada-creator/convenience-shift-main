import type { SessionUser } from '@/lib/auth';

export interface Store {
  id: number;
  name: string;
}

export interface Staff {
  id: number;
  name: string;
  role: string;
  employmentType: string;
  storeId: number;
}

export interface Shift {
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

export interface ShiftRequirement {
  id: number;
  storeId: number;
  dayOfWeek: number;
  timeSlot: string;
  requiredCount: number;
}

export interface AvailabilityPattern {
  id: number;
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface DailyShiftContentProps {
  user: SessionUser;
  date: string;
  initialStoreId?: number;
}

export interface ActiveShift {
  shiftId: number;
  staffId: number;
  startTime: string;
  endTime: string;
}

export const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];
