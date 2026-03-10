// スタッフ情報
export interface StaffInfo {
  id: string;
  name: string;
  hourlyWage: number;
  employmentType: 'employee' | 'part_time'; // employee=社員, part_time=アルバイト
}

// 勤務可能時間パターン
export interface AvailabilityPattern {
  staffId: string;
  dayOfWeek: number; // 0=日曜, 1=月曜, ...
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

// 休み希望
export interface TimeOffRequest {
  staffId: string;
  date: string;       // "YYYY-MM-DD"
  startTime?: string; // "HH:mm" 省略時は終日
  endTime?: string;   // "HH:mm"
  status: "pending" | "approved" | "rejected";
}

// シフト必要人数
export interface ShiftRequirement {
  dayOfWeek: number;
  hour: number;
  requiredCount: number;
}

// 既存シフト
export interface ExistingShift {
  id: string;
  staffId: string;
  staffName: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

// 自動割り振り入力データ
export interface AutoAssignInput {
  date: string;            // "YYYY-MM-DD"
  dayOfWeek: number;       // 0-6
  staff: StaffInfo[];
  availabilities: AvailabilityPattern[];
  timeOffRequests: TimeOffRequest[];
  requirements: ShiftRequirement[];
  existingShifts: ExistingShift[];
}

// 不足時間帯
export interface GapSlot {
  hour: number;
  minute: number;         // 0 or 30
  required: number;       // 必要人数
  current: number;        // 現在の配置人数
  shortage: number;       // 不足人数 (required - current)
}

// Gemini APIへのリクエスト用データ
export interface GeminiShiftRequest {
  date: string;
  dayOfWeek: string;      // "月曜日"など
  gaps: GapSlot[];
  availableStaff: {
    id: string;
    name: string;
    employmentType: 'employee' | 'part_time'; // employee=社員, part_time=アルバイト
    availableFrom: string;
    availableTo: string;
  }[];
  existingShifts: {
    staffId: string;
    staffName: string;
    from: string;
    to: string;
  }[];
}

// Gemini APIからのレスポンス
export interface GeminiShiftResponse {
  proposedShifts: ProposedShift[];
  unfilledSlots: UnfilledSlot[];
  summary: {
    totalProposed: number;
    coverageImprovement: number; // パーセント
  };
}

// 提案されたシフト
export interface ProposedShift {
  staffId: string;
  staffName: string;
  startTime: string;     // "HH:mm"
  endTime: string;       // "HH:mm"
  reason: string;        // 割り当て理由
}

// 充足できなかったスロット
export interface UnfilledSlot {
  timeRange: string;     // "22:00-23:00"
  reason: string;        // 充足できなかった理由
}

// プレビュー表示用データ
export interface AutoAssignPreview {
  date: string;
  beforeCoverage: number;  // 適用前カバー率（%）
  afterCoverage: number;   // 適用後カバー率（%）
  proposedShifts: ProposedShift[];
  unfilledSlots: UnfilledSlot[];
  isLoading: boolean;
  error: string | null;
}

// シフト適用リクエスト
export interface ApplyShiftsRequest {
  date: string;
  shifts: {
    staffId: string;
    startTime: string;
    endTime: string;
  }[];
}
