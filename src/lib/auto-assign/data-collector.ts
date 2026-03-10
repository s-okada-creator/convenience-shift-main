import type {
  AutoAssignInput,
  StaffInfo,
  AvailabilityPattern,
  TimeOffRequest,
  ShiftRequirement,
  ExistingShift,
} from "@/lib/gemini/types";

// APIレスポンスの型定義
interface StaffApiResponse {
  id: number;
  name: string;
  hourlyRate: number;
  storeId: number;
  employmentType: 'employee' | 'part_time';
}

interface AvailabilityApiResponse {
  id: number;
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface TimeOffApiResponse {
  id: number;
  staffId: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: "pending" | "approved" | "rejected";
}

interface RequirementApiResponse {
  id: number;
  storeId: number;
  dayOfWeek: number;
  timeSlot: string;
  requiredCount: number;
}

interface ShiftApiResponse {
  id: number;
  staffId: number;
  storeId: number;
  date: string;
  startTime: string;
  endTime: string;
  staffName: string | null;
  staffRole: string | null;
}

// 日付から曜日を取得
export function getDayOfWeek(dateString: string): number {
  const date = new Date(dateString);
  return date.getDay(); // 0=日曜, 1=月曜, ...
}

// 自動割り振りに必要なデータを収集
export async function collectAutoAssignData(
  date: string,
  storeId: number
): Promise<AutoAssignInput> {
  const response = await fetch(`/api/auto-assign-input?storeId=${storeId}&date=${date}`);
  if (!response.ok) {
    throw new Error("自動割り振り入力の取得に失敗しました");
  }
  return await response.json();
}

// スタッフ一覧を取得
async function fetchStaff(storeId: number): Promise<StaffInfo[]> {
  const response = await fetch(`/api/staff?storeId=${storeId}`);
  if (!response.ok) {
    throw new Error("スタッフ情報の取得に失敗しました");
  }

  const data: StaffApiResponse[] = await response.json();
  return data.map((s) => ({
    id: String(s.id),
    name: s.name,
    hourlyWage: s.hourlyRate,
    employmentType: s.employmentType,
  }));
}

// 勤務可能時間パターンを取得（指定曜日）
async function fetchAvailabilities(
  storeId: number,
  dayOfWeek: number
): Promise<AvailabilityPattern[]> {
  const response = await fetch(`/api/availability?storeId=${storeId}&dayOfWeek=${dayOfWeek}`);
  if (!response.ok) {
    throw new Error("勤務可能時間の取得に失敗しました");
  }

  // APIはスタッフIDをキーとしたオブジェクトを返す
  const data: Record<string, AvailabilityApiResponse[]> = await response.json();

  const result: AvailabilityPattern[] = [];
  for (const [staffId, patterns] of Object.entries(data)) {
    // 指定曜日のパターンのみフィルタ
    for (const a of patterns) {
      if (a.dayOfWeek === dayOfWeek) {
        result.push({
          staffId: staffId,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime.slice(0, 5),
          endTime: a.endTime.slice(0, 5),
        });
      }
    }
  }
  return result;
}

// 休み希望を取得（指定日の承認済みのみ）
async function fetchTimeOffRequests(storeId: number, date: string): Promise<TimeOffRequest[]> {
  const response = await fetch(
    `/api/time-off-requests?storeId=${storeId}&startDate=${date}&endDate=${date}&status=approved`
  );
  if (!response.ok) {
    // 休み希望が取得できなくても続行（エラーにしない）
    console.warn("休み希望の取得に失敗しました");
    return [];
  }

  const data: TimeOffApiResponse[] = await response.json();

  // 承認済み休暇のみフィルタ
  return data
    .filter((t) => t.status === "approved")
    .map((t) => ({
      staffId: String(t.staffId),
      date: t.date,
      startTime: t.startTime ? t.startTime.slice(0, 5) : undefined,
      endTime: t.endTime ? t.endTime.slice(0, 5) : undefined,
      status: t.status,
    }));
}

// シフト必要人数を取得（指定曜日）
async function fetchRequirements(
  storeId: number,
  dayOfWeek: number
): Promise<ShiftRequirement[]> {
  const response = await fetch(
    `/api/shift-requirements?storeId=${storeId}&dayOfWeek=${dayOfWeek}`
  );
  if (!response.ok) {
    throw new Error("必要人数の取得に失敗しました");
  }

  const data: RequirementApiResponse[] = await response.json();

  // timeSlotをhourとminuteに変換
  return data.map((r) => {
    const [hour, minute] = r.timeSlot.split(":").map(Number);
    return {
      dayOfWeek: r.dayOfWeek,
      hour,
      minute,
      requiredCount: r.requiredCount,
    };
  });
}

// 既存シフトを取得（指定日）
async function fetchExistingShifts(
  storeId: number,
  date: string
): Promise<ExistingShift[]> {
  const response = await fetch(
    `/api/shifts?storeId=${storeId}&startDate=${date}&endDate=${date}`
  );
  if (!response.ok) {
    throw new Error("既存シフトの取得に失敗しました");
  }

  const data: ShiftApiResponse[] = await response.json();

  return data.map((s) => ({
    id: String(s.id),
    staffId: String(s.staffId),
    staffName: s.staffName || "不明",
    startTime: s.startTime.slice(0, 5),
    endTime: s.endTime.slice(0, 5),
  }));
}

// 勤務可能なスタッフをフィルタ（休暇・既存シフト考慮）
export function getAvailableStaff(
  input: AutoAssignInput
): {
  id: string;
  name: string;
  employmentType: 'employee' | 'part_time';
  availableFrom: string;
  availableTo: string;
}[] {
  const result: {
    id: string;
    name: string;
    employmentType: 'employee' | 'part_time';
    availableFrom: string;
    availableTo: string;
  }[] = [];

  for (const staff of input.staff) {
    // 休暇中のスタッフは除外（日付が一致する場合のみ）
    const hasFullDayOff = input.timeOffRequests.some(
      (t) => t.staffId === staff.id && t.date === input.date && !t.startTime && !t.endTime
    );
    if (hasFullDayOff) continue;

    // 勤務可能時間パターンを取得
    const availability = input.availabilities.find(
      (a) => a.staffId === staff.id
    );
    if (!availability) continue;

    // 既存シフトがあるスタッフも考慮（重複しないように）
    const existingShift = input.existingShifts.find(
      (s) => s.staffId === staff.id
    );

    // 時間部分休暇を考慮
    const partialTimeOff = input.timeOffRequests.find(
      (t) => t.staffId === staff.id && t.date === input.date && t.startTime && t.endTime
    );

    // 勤務可能時間を調整
    let availableFrom = availability.startTime;
    let availableTo = availability.endTime;

    // 部分休暇がある場合は勤務可能時間を調整
    if (partialTimeOff && partialTimeOff.startTime && partialTimeOff.endTime) {
      // 簡易処理: 休暇時間帯を避ける（前半または後半のみ勤務可能）
      const offStart = partialTimeOff.startTime;
      const offEnd = partialTimeOff.endTime;

      if (availability.startTime < offStart) {
        availableTo = offStart;
      } else if (availability.endTime > offEnd) {
        availableFrom = offEnd;
      } else {
        // 勤務可能時間が完全に休暇時間内の場合はスキップ
        continue;
      }
    }

    // 既存シフトがある場合は、その時間帯を除外
    // （複雑なケースは一旦スキップ: 既存シフトがあるスタッフは除外）
    if (existingShift) {
      continue;
    }

    result.push({
      id: staff.id,
      name: staff.name,
      employmentType: staff.employmentType,
      availableFrom,
      availableTo,
    });
  }

  return result;
}
