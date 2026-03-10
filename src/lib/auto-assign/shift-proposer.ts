import type {
  AutoAssignInput,
  GeminiShiftRequest,
  GeminiShiftResponse,
  ProposedShift,
} from "@/lib/gemini/types";
import { collectAutoAssignData, getAvailableStaff } from "./data-collector";
import {
  analyzeGaps,
  calculateCoverageRate,
  calculateCoverageWithNewShifts,
} from "./gap-analyzer";
import { getDayName } from "@/lib/gemini/prompts";
import { requestShiftAssignment } from "@/lib/gemini/client";
import { timeToMinutes } from "@/lib/time-constants";

export interface ShiftProposalResult {
  date: string;
  beforeCoverage: number;
  afterCoverage: number;
  proposedShifts: ProposedShift[];
  unfilledSlots: GeminiShiftResponse["unfilledSlots"];
  rawInput: AutoAssignInput;
}

// シフト提案を実行
export async function proposeShifts(date: string, storeId: number): Promise<ShiftProposalResult> {
  // 1. データ収集
  const input = await collectAutoAssignData(date, storeId);

  // 2. 不足時間帯を分析
  const gaps = analyzeGaps(input);

  // 3. 現在のカバー率を計算
  const beforeCoverage = calculateCoverageRate(input);

  // 4. 全て充足済みの場合は早期リターン
  if (gaps.length === 0) {
    return {
      date,
      beforeCoverage: 100,
      afterCoverage: 100,
      proposedShifts: [],
      unfilledSlots: [],
      rawInput: input,
    };
  }

  // 5. 勤務可能なスタッフを抽出
  const availableStaff = getAvailableStaff(input);

  // 6. 勤務可能スタッフがいない場合
  if (availableStaff.length === 0) {
    return {
      date,
      beforeCoverage,
      afterCoverage: beforeCoverage,
      proposedShifts: [],
      unfilledSlots: [
        {
          timeRange: formatGapRange(gaps),
          reason: "この日に勤務可能なスタッフが登録されていません",
        },
      ],
      rawInput: input,
    };
  }

  // 7. Gemini APIリクエストを構築
  const request: GeminiShiftRequest = {
    date,
    dayOfWeek: getDayName(input.dayOfWeek),
    gaps,
    availableStaff,
    existingShifts: input.existingShifts.map((s) => ({
      staffId: s.staffId,
      staffName: s.staffName,
      from: s.startTime,
      to: s.endTime,
    })),
  };

  // 8. Gemini APIを呼び出し
  const response = await requestShiftAssignment(request);

  // 9. 提案シフトのバリデーション
  const validatedShifts = validateProposedShifts(
    response.proposedShifts,
    input,
    availableStaff
  );

  // 10. 新しいカバー率を計算
  const afterCoverage = calculateCoverageWithNewShifts(
    input,
    validatedShifts.map((s) => ({
      startTime: s.startTime,
      endTime: s.endTime,
    }))
  );

  return {
    date,
    beforeCoverage,
    afterCoverage,
    proposedShifts: validatedShifts,
    unfilledSlots: response.unfilledSlots,
    rawInput: input,
  };
}

// 提案シフトのバリデーション
function validateProposedShifts(
  shifts: ProposedShift[],
  input: AutoAssignInput,
  availableStaff: { id: string; name: string; employmentType: 'employee' | 'part_time'; availableFrom: string; availableTo: string }[]
): ProposedShift[] {
  return shifts.filter((shift) => {
    // スタッフが存在するか確認
    const staff = availableStaff.find((s) => s.id === shift.staffId);
    if (!staff) {
      console.warn(`Unknown staff ID: ${shift.staffId}`);
      return false;
    }

    // 勤務可能時間内かチェック
    if (!isWithinAvailability(shift, staff)) {
      console.warn(
        `Shift outside availability: ${shift.staffName} ${shift.startTime}-${shift.endTime}`
      );
      return false;
    }

    // 既存シフトと重複していないか
    const hasOverlap = input.existingShifts.some(
      (existing) =>
        existing.staffId === shift.staffId &&
        isTimeOverlap(
          shift.startTime,
          shift.endTime,
          existing.startTime,
          existing.endTime
        )
    );
    if (hasOverlap) {
      console.warn(`Overlapping shift: ${shift.staffName}`);
      return false;
    }

    return true;
  });
}

// 勤務可能時間内かチェック
function isWithinAvailability(
  shift: ProposedShift,
  availability: { availableFrom: string; availableTo: string }
): boolean {
  const shiftStart = timeToMinutes(shift.startTime);
  const shiftEnd = timeToMinutes(shift.endTime);
  const availFrom = timeToMinutes(availability.availableFrom);
  const availTo = timeToMinutes(availability.availableTo);

  return shiftStart >= availFrom && shiftEnd <= availTo;
}

// 時間の重複チェック
function isTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);

  return s1 < e2 && e1 > s2;
}

// 不足時間帯の範囲をフォーマット
function formatGapRange(
  gaps: { hour: number; minute: number }[]
): string {
  if (gaps.length === 0) return "";

  const first = gaps[0];
  const last = gaps[gaps.length - 1];

  const startTime = `${String(first.hour).padStart(2, "0")}:${String(first.minute).padStart(2, "0")}`;
  const endMinute = last.minute + 30;
  const endHour = endMinute >= 60 ? last.hour + 1 : last.hour;
  const endTime = `${String(endHour % 24).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;

  return `${startTime}-${endTime}`;
}

// シフトを適用（API呼び出し）
export async function applyProposedShifts(
  date: string,
  storeId: number,
  shifts: ProposedShift[]
): Promise<void> {
  const requests = shifts.map((s) =>
    fetch("/api/shifts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        staffId: parseInt(s.staffId, 10),
        storeId,
        date,
        startTime: s.startTime,
        endTime: s.endTime,
      }),
    })
  );

  const responses = await Promise.all(requests);
  for (const response of responses) {
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "シフトの保存に失敗しました");
    }
  }
}
