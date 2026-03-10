import type {
  AutoAssignInput,
  GapSlot,
  ExistingShift,
  ShiftRequirement,
} from "@/lib/gemini/types";
import { timeToMinutes } from "@/lib/time-constants";

// 30分スロット単位で不足を分析
export function analyzeGaps(input: AutoAssignInput): GapSlot[] {
  const gaps: GapSlot[] = [];

  // 0:00から23:30まで30分刻みでチェック
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const slotStart = hour * 60 + minute;
      const slotEnd = slotStart + 30;

      // この時間帯の必要人数を取得
      const requirement = getRequirementForSlot(input.requirements, hour);
      if (requirement === 0) continue;

      // この時間帯にシフトが入っているスタッフ数をカウント
      const currentCount = countStaffInSlot(
        input.existingShifts,
        slotStart,
        slotEnd
      );

      // 不足がある場合のみ追加
      const shortage = requirement - currentCount;
      if (shortage > 0) {
        gaps.push({
          hour,
          minute,
          required: requirement,
          current: currentCount,
          shortage,
        });
      }
    }
  }

  return gaps;
}

// 指定時刻の必要人数を取得
function getRequirementForSlot(
  requirements: ShiftRequirement[],
  hour: number
): number {
  const req = requirements.find((r) => r.hour === hour);
  return req?.requiredCount ?? 0;
}

// 指定時間帯にシフトが入っているスタッフ数をカウント
function countStaffInSlot(
  shifts: ExistingShift[],
  slotStart: number,
  slotEnd: number
): number {
  return shifts.filter((shift) => {
    const shiftStart = timeToMinutes(shift.startTime);
    const shiftEnd = timeToMinutes(shift.endTime);

    // シフトが時間帯と重複しているかチェック
    return shiftStart < slotEnd && shiftEnd > slotStart;
  }).length;
}

// 連続する不足時間帯をグループ化
export function groupConsecutiveGaps(
  gaps: GapSlot[]
): { start: string; end: string; maxShortage: number }[] {
  if (gaps.length === 0) return [];

  const groups: { start: string; end: string; maxShortage: number }[] = [];
  let currentGroup: GapSlot[] = [gaps[0]];

  for (let i = 1; i < gaps.length; i++) {
    const prev = gaps[i - 1];
    const curr = gaps[i];

    // 連続しているかチェック（30分差）
    const prevMinutes = prev.hour * 60 + prev.minute;
    const currMinutes = curr.hour * 60 + curr.minute;

    if (currMinutes - prevMinutes === 30) {
      currentGroup.push(curr);
    } else {
      // グループ確定
      groups.push(createGroupSummary(currentGroup));
      currentGroup = [curr];
    }
  }

  // 最後のグループを追加
  groups.push(createGroupSummary(currentGroup));

  return groups;
}

function createGroupSummary(
  slots: GapSlot[]
): { start: string; end: string; maxShortage: number } {
  const first = slots[0];
  const last = slots[slots.length - 1];

  const startTime = formatTime(first.hour, first.minute);
  const endTime = formatTime(last.hour, last.minute + 30);
  const maxShortage = Math.max(...slots.map((s) => s.shortage));

  return { start: startTime, end: endTime, maxShortage };
}

function formatTime(hour: number, minute: number): string {
  // 24:00以上の場合の処理
  if (minute >= 60) {
    hour += 1;
    minute -= 60;
  }
  if (hour >= 24) {
    hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// カバー率を計算
export function calculateCoverageRate(input: AutoAssignInput): number {
  let totalRequired = 0;
  let totalCovered = 0;

  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const slotStart = hour * 60 + minute;
      const slotEnd = slotStart + 30;

      const requirement = getRequirementForSlot(input.requirements, hour);
      if (requirement === 0) continue;

      const currentCount = countStaffInSlot(
        input.existingShifts,
        slotStart,
        slotEnd
      );

      totalRequired += requirement;
      totalCovered += Math.min(currentCount, requirement);
    }
  }

  if (totalRequired === 0) return 100;
  return Math.round((totalCovered / totalRequired) * 100);
}

// 新しいシフトを追加した場合のカバー率を計算
export function calculateCoverageWithNewShifts(
  input: AutoAssignInput,
  newShifts: { startTime: string; endTime: string }[]
): number {
  // 既存シフトと新規シフトを合わせた仮想リストを作成
  const allShifts: ExistingShift[] = [
    ...input.existingShifts,
    ...newShifts.map((s, i) => ({
      id: `new-${i}`,
      staffId: `new-staff-${i}`,
      staffName: `New Staff ${i}`,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  ];

  let totalRequired = 0;
  let totalCovered = 0;

  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const slotStart = hour * 60 + minute;
      const slotEnd = slotStart + 30;

      const requirement = getRequirementForSlot(input.requirements, hour);
      if (requirement === 0) continue;

      const currentCount = countStaffInSlot(allShifts, slotStart, slotEnd);

      totalRequired += requirement;
      totalCovered += Math.min(currentCount, requirement);
    }
  }

  if (totalRequired === 0) return 100;
  return Math.round((totalCovered / totalRequired) * 100);
}
