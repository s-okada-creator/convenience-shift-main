/**
 * 共通型定義
 * アプリケーション全体で使用する型を一元管理
 */

// DBスキーマからの型をre-export
export type {
  Store,
  NewStore,
  Staff,
  NewStaff,
  AvailabilityPattern,
  NewAvailabilityPattern,
  TimeOffRequest,
  NewTimeOffRequest,
  ShiftRequirement,
  NewShiftRequirement,
  Shift,
  NewShift,
} from '@/lib/db/schema';

// ロール型
export type Role = 'owner' | 'manager' | 'staff';

// 雇用形態型（DBと統一: part_time）
export type EmploymentType = 'employee' | 'part_time';

// 休暇ステータス型
export type TimeOffStatus = 'pending' | 'approved' | 'rejected';

// セッションユーザー型
export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  storeId: number;
  storeName: string;
}

// 拡張されたスタッフ型（表示用）
export interface StaffWithDetails extends Omit<import('@/lib/db/schema').Staff, 'employmentType'> {
  employmentType: EmploymentType;
  storeName?: string;
}

// 拡張されたシフト型（表示用）
export interface ShiftWithDetails extends Omit<import('@/lib/db/schema').Shift, 'staffId' | 'storeId'> {
  staffId: number;
  storeId: number;
  staffName: string | null;
  staffRole: string | null;
}

// APIレスポンス型
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// ページネーション型
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// 日付範囲型
export interface DateRange {
  startDate: string;
  endDate: string;
}

// 時間範囲型
export interface TimeRange {
  startTime: string;
  endTime: string;
}

// シフト提案型（AI自動割り振り用）
export interface ProposedShift {
  staffId: number;
  staffName: string;
  startTime: string;
  endTime: string;
  reason?: string;
}

// 勤務可能時間表示用
export interface AvailabilityDisplay {
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
}

// 曜日定数
export const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
