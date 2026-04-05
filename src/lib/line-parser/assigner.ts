/**
 * シフト自動配置アルゴリズム
 *
 * LINEパーサーの結果を元に、時間帯別の必要人数に対して
 * バイトを自動配置する。社員枠は空けておく。
 */

import type { ParsedStaff, ParsedEntry, ParseResult } from './index';

// --- 型定義 ---

export interface TimeSlotDef {
  id: string;
  label: string;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  required: number;
  isOvernight?: boolean;
}

export interface AssignedShift {
  staffName: string;
  day: number;
  startTime: string;
  endTime: string;
  slotId: string;
}

export interface GapInfo {
  day: number;
  slotId: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  required: number;
  assigned: number;
  shortage: number;
}

export interface AssignResult {
  shifts: AssignedShift[];
  gaps: GapInfo[];
  stats: {
    totalSlots: number;
    filledSlots: number;
    coveragePercent: number;
  };
}

// --- デフォルトの時間帯定義（野崎店ベース） ---

export const DEFAULT_TIME_SLOTS: TimeSlotDef[] = [
  { id: 'night',   label: '夜勤',   start: '21:45', end: '06:00', required: 1, isOvernight: true },
  { id: 'early',   label: '早朝',   start: '06:00', end: '09:00', required: 3 },
  { id: 'day',     label: '日勤',   start: '09:00', end: '17:00', required: 2 },
  { id: 'evening', label: '夕勤',   start: '17:00', end: '21:45', required: 2 },
];

// --- ユーティリティ ---

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** スタッフの希望時間がスロットをカバーできるか判定 */
function canCoverSlot(entry: ParsedEntry, slot: TimeSlotDef): boolean {
  if (!entry.available) return false;
  if (!entry.startTime || !entry.endTime) {
    // 時間未指定で available=true → ○だけの人（時間不明）
    // 安全策: 日勤(9-17)として扱う
    return slot.id === 'day';
  }

  const eStart = timeToMin(entry.startTime);
  let eEnd = timeToMin(entry.endTime);
  const sStart = timeToMin(slot.start);
  let sEnd = timeToMin(slot.end);

  // 日跨ぎ処理
  if (slot.isOvernight) sEnd += 24 * 60;
  if (eEnd <= eStart) eEnd += 24 * 60; // 夜勤: 21:45-6:00 → 21:45-30:00

  // スタッフの勤務可能時間がスロットの大半（50%以上）をカバーしているか
  const overlapStart = Math.max(eStart, sStart);
  const overlapEnd = Math.min(eEnd, sEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const slotDuration = sEnd - sStart;

  return overlap >= slotDuration * 0.5;
}

/** 週あたりの配置回数を制限（週3希望等） */
function getWeeklyLimit(staff: ParsedStaff): number {
  if (!staff.constraints) return 99;
  for (const c of staff.constraints) {
    const m = c.match(/週(\d)/);
    if (m) return parseInt(m[1]);
  }
  return 99;
}

// --- メイン配置アルゴリズム ---

export function autoAssign(
  parseResult: ParseResult,
  timeSlots: TimeSlotDef[] = DEFAULT_TIME_SLOTS
): AssignResult {
  const { period, staff } = parseResult;
  const shifts: AssignedShift[] = [];
  const gaps: GapInfo[] = [];

  // 対象日のリスト（月の実日数を考慮）
  const startDay = period.half === 'first' ? 1 : 16;
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const endDay = period.half === 'first' ? 15 : daysInMonth;

  // スタッフごとの配置回数カウント
  const assignCount = new Map<string, number>();
  staff.forEach(s => assignCount.set(s.name, 0));

  // 埋まりにくい順にスロットを処理（夜勤→早朝→夕勤→日勤）
  const slotPriority = ['night', 'early', 'evening', 'day'];

  let totalSlots = 0;
  let filledSlots = 0;

  for (let day = startDay; day <= endDay; day++) {
    for (const prioritySlotId of slotPriority) {
      const slot = timeSlots.find(s => s.id === prioritySlotId);
      if (!slot) continue;

      totalSlots += slot.required;

      // この日このスロットに入れる候補を集める
      const candidates: { staff: ParsedStaff; entry: ParsedEntry }[] = [];

      for (const s of staff) {
        const entry = s.entries.find(e => e.day === day);
        if (!entry) continue;
        if (!canCoverSlot(entry, slot)) continue;

        // 週制限チェック
        const weeklyLimit = getWeeklyLimit(s);
        const currentCount = assignCount.get(s.name) || 0;
        // 期間の日数から上限を算出
        const periodDays = endDay - startDay + 1;
        const maxTotal = Math.ceil(periodDays / 7 * weeklyLimit);
        if (currentCount >= maxTotal) continue;

        candidates.push({ staff: s, entry });
      }

      // 候補をソート: 配置回数が少ない人優先（均等配分）
      candidates.sort((a, b) => {
        const countA = assignCount.get(a.staff.name) || 0;
        const countB = assignCount.get(b.staff.name) || 0;
        return countA - countB;
      });

      // 必要人数分だけ配置
      let assigned = 0;
      for (const candidate of candidates) {
        if (assigned >= slot.required) break;

        // この人がこの日にすでに配置されていないか（時間重複もチェック）
        const existingForDay = shifts.filter(
          s => s.staffName === candidate.staff.name && s.day === day
        );
        if (existingForDay.length > 0) {
          // 時間重複チェック（夜勤→早朝の連続勤務を防ぐ）
          const hasOverlap = existingForDay.some(existing => {
            const exStart = timeToMin(existing.startTime);
            let exEnd = timeToMin(existing.endTime);
            const slotStart = timeToMin(slot.start);
            let slotEnd = timeToMin(slot.end);
            if (exEnd <= exStart) exEnd += 24 * 60;
            if (slotEnd <= slotStart) slotEnd += 24 * 60;
            // 隣接（終了=開始）も重複扱い
            return exStart < slotEnd && exEnd > slotStart;
          });
          if (hasOverlap) continue;
          // 時間が離れていても同日2スロットは避ける
          continue;
        }

        // 配置
        const startTime = candidate.entry.startTime || slot.start;
        const endTime = candidate.entry.endTime || slot.end;

        shifts.push({
          staffName: candidate.staff.name,
          day,
          startTime,
          endTime,
          slotId: slot.id,
        });

        assignCount.set(candidate.staff.name, (assignCount.get(candidate.staff.name) || 0) + 1);
        assigned++;
      }

      filledSlots += assigned;

      // 不足があればギャップとして記録
      if (assigned < slot.required) {
        gaps.push({
          day,
          slotId: slot.id,
          slotLabel: slot.label,
          startTime: slot.start,
          endTime: slot.end,
          required: slot.required,
          assigned,
          shortage: slot.required - assigned,
        });
      }
    }
  }

  return {
    shifts,
    gaps,
    stats: {
      totalSlots,
      filledSlots,
      coveragePercent: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
    },
  };
}
