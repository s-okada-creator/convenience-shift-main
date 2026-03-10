import type { GeminiShiftRequest } from "./types";

// 曜日名の定義
const DAY_NAMES = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

// シフト割り振りプロンプトを構築
export function buildShiftAssignmentPrompt(request: GeminiShiftRequest): string {
  return `あなたはコンビニのシフト管理アシスタントです。以下の条件に基づいて、最適なシフト割り当てを提案してください。

## 対象日
${request.date}（${request.dayOfWeek}）

## 人員不足時間帯
${formatGaps(request.gaps)}

## 勤務可能なスタッフ
${formatAvailableStaff(request.availableStaff)}

## 既存シフト（重複不可）
${formatExistingShifts(request.existingShifts)}

## 制約条件（優先順位順）
1. スタッフの勤務可能時間を厳守（時間外の割り当て禁止）
2. 既存シフトと時間が重複するスタッフには割り当てない
3. 1日の勤務時間は原則8時間以内を推奨（労働基準法の法定労働時間）
   - やむを得ず8時間を超える場合は残業扱いとなる
   - 可能な限り複数人に分散して8時間以内に収める
4. 不足時間帯をできるだけ埋める
5. 連続した時間帯を1つのシフトにまとめる（細切れ禁止）
6. 最低シフト時間は2時間以上

## 出力形式
以下のJSON形式で回答してください:
{
  "proposedShifts": [
    {
      "staffId": "スタッフID",
      "staffName": "スタッフ名",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "reason": "割り当て理由（日本語で簡潔に）"
    }
  ],
  "unfilledSlots": [
    {
      "timeRange": "HH:mm-HH:mm",
      "reason": "充足できなかった理由（日本語で簡潔に）"
    }
  ],
  "summary": {
    "totalProposed": 提案シフト数,
    "coverageImprovement": カバー率改善（パーセント）
  }
}

もし勤務可能なスタッフがいない、または全ての不足を埋められない場合は、unfilledSlotsに理由を記載してください。`;
}

// 不足時間帯をフォーマット
function formatGaps(gaps: GeminiShiftRequest["gaps"]): string {
  if (gaps.length === 0) {
    return "なし（全時間帯充足済み）";
  }

  // 連続する時間帯をグループ化して表示
  const grouped = groupConsecutiveGaps(gaps);

  return grouped
    .map((g) => {
      const timeRange = `${g.start}〜${g.end}`;
      return `- ${timeRange}: 最大不足${g.maxShortage}人`;
    })
    .join("\n");
}

// 連続する不足時間帯をグループ化（プロンプト用）
function groupConsecutiveGaps(
  gaps: GeminiShiftRequest["gaps"]
): { start: string; end: string; maxShortage: number }[] {
  if (gaps.length === 0) return [];

  const groups: { start: string; end: string; maxShortage: number }[] = [];
  let groupStart = gaps[0];
  let groupEnd = gaps[0];
  let maxShortage = gaps[0].shortage;

  for (let i = 1; i < gaps.length; i++) {
    const prev = gaps[i - 1];
    const curr = gaps[i];

    const prevMinutes = prev.hour * 60 + prev.minute;
    const currMinutes = curr.hour * 60 + curr.minute;

    if (currMinutes - prevMinutes === 30) {
      groupEnd = curr;
      maxShortage = Math.max(maxShortage, curr.shortage);
    } else {
      groups.push({
        start: formatTime(groupStart.hour, groupStart.minute),
        end: formatTime(groupEnd.hour, groupEnd.minute + 30),
        maxShortage,
      });
      groupStart = curr;
      groupEnd = curr;
      maxShortage = curr.shortage;
    }
  }

  groups.push({
    start: formatTime(groupStart.hour, groupStart.minute),
    end: formatTime(groupEnd.hour, groupEnd.minute + 30),
    maxShortage,
  });

  return groups;
}

// 勤務可能スタッフをフォーマット
function formatAvailableStaff(
  staff: GeminiShiftRequest["availableStaff"]
): string {
  if (staff.length === 0) {
    return "なし（勤務可能なスタッフがいません）";
  }

  return staff
    .map((s) => `- ${s.name}（ID: ${s.id}）: ${s.availableFrom}〜${s.availableTo}`)
    .join("\n");
}

// 既存シフトをフォーマット
function formatExistingShifts(
  shifts: GeminiShiftRequest["existingShifts"]
): string {
  if (shifts.length === 0) {
    return "なし";
  }

  return shifts
    .map((s) => `- ${s.staffName}: ${s.from}〜${s.to}`)
    .join("\n");
}

// 時刻フォーマット
function formatTime(hour: number, minute: number): string {
  if (minute >= 60) {
    hour += 1;
    minute -= 60;
  }
  if (hour >= 24) {
    hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// 曜日番号から曜日名を取得
export function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "不明";
}
