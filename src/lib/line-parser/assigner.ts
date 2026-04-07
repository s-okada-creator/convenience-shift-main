/**
 * シフト自動配置アルゴリズム
 *
 * LINEパーサーの結果を元に、時間帯別の必要人数に対して
 * バイトを自動配置する。社員枠は空けておく。
 *
 * 必要人数はDB（必要人数設定）から取得した30分刻みデータを
 * 時間帯スロットにグルーピングして使用する。
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

/** DB APIから取得した必要人数の1レコード */
export interface DbRequirement {
  dayOfWeek: number;  // 0=日, 6=土
  timeSlot: string;   // "09:00"
  requiredCount: number;
}

// --- デフォルトの時間帯定義（DB未設定時のフォールバック） ---

export const DEFAULT_TIME_SLOTS: TimeSlotDef[] = [
  { id: 'night',   label: '夜勤',   start: '21:45', end: '06:00', required: 1, isOvernight: true },
  { id: 'early',   label: '早朝',   start: '06:00', end: '09:00', required: 3 },
  { id: 'day',     label: '日勤',   start: '09:00', end: '17:00', required: 2 },
  { id: 'evening', label: '夕勤',   start: '17:00', end: '21:45', required: 2 },
];

// --- DB必要人数 → 時間帯スロット変換 ---

/** 時間帯ラベル割り当て */
function getSlotLabel(startHour: number): string {
  if (startHour >= 22 || startHour < 5) return '夜勤';
  if (startHour >= 5 && startHour < 9) return '早朝';
  if (startHour >= 9 && startHour < 17) return '日勤';
  return '夕勤';
}

/**
 * DBの30分刻み必要人数を、連続する同一人数の時間帯にグルーピング
 *
 * 例: 06:00=3, 06:30=3, 07:00=3, ..., 08:30=3 → { start:"06:00", end:"09:00", required:3 }
 *     09:00=2, 09:30=2, ..., 16:30=2 → { start:"09:00", end:"17:00", required:2 }
 */
export function dbRequirementsToSlots(requirements: DbRequirement[], dayOfWeek: number): TimeSlotDef[] {
  // この曜日の必要人数だけフィルタ
  const dayReqs = requirements
    .filter(r => r.dayOfWeek === dayOfWeek && r.requiredCount > 0)
    .sort((a, b) => {
      const aMin = timeToMin(a.timeSlot);
      const bMin = timeToMin(b.timeSlot);
      return aMin - bMin;
    });

  if (dayReqs.length === 0) return [];

  const slots: TimeSlotDef[] = [];
  let currentStart = dayReqs[0].timeSlot;
  let currentRequired = dayReqs[0].requiredCount;
  let prevTimeMin = timeToMin(dayReqs[0].timeSlot);

  for (let i = 1; i < dayReqs.length; i++) {
    const req = dayReqs[i];
    const reqTimeMin = timeToMin(req.timeSlot);

    // 連続かつ同じ必要人数 → 結合を続ける
    // 30分間隔で連続しているか
    const isConsecutive = reqTimeMin - prevTimeMin === 30;
    const isSameCount = req.requiredCount === currentRequired;

    if (isConsecutive && isSameCount) {
      prevTimeMin = reqTimeMin;
      continue;
    }

    // 前のグループを確定
    const endMin = prevTimeMin + 30;
    const endTime = minToTime(endMin);
    const startHour = parseInt(currentStart.split(':')[0]);
    const isOvernight = startHour >= 21 && endMin <= 6 * 60 + 30;

    slots.push({
      id: `slot-${currentStart}`,
      label: getSlotLabel(startHour),
      start: currentStart,
      end: endTime,
      required: currentRequired,
      isOvernight,
    });

    // 新しいグループ開始
    currentStart = req.timeSlot;
    currentRequired = req.requiredCount;
    prevTimeMin = reqTimeMin;
  }

  // 最後のグループを確定
  const endMin = prevTimeMin + 30;
  const endTime = minToTime(endMin);
  const startHour = parseInt(currentStart.split(':')[0]);

  slots.push({
    id: `slot-${currentStart}`,
    label: getSlotLabel(startHour),
    start: currentStart,
    end: endTime,
    required: currentRequired,
    isOvernight: startHour >= 21,
  });

  // 夜勤の日跨ぎ処理: 21:xx-23:xxのスロットと00:xx-05:xxのスロットを結合
  const nightSlots = slots.filter(s => s.isOvernight);
  const earlyMorningSlots = slots.filter(s => {
    const h = parseInt(s.start.split(':')[0]);
    return h >= 0 && h < 6;
  });

  if (nightSlots.length > 0 && earlyMorningSlots.length > 0) {
    const night = nightSlots[0];
    const early = earlyMorningSlots[0];
    // 同じ必要人数なら結合
    if (night.required === early.required) {
      night.end = early.end;
      night.isOvernight = true;
      // earlyMorningSlotを削除
      const idx = slots.indexOf(early);
      if (idx >= 0) slots.splice(idx, 1);
    }
  }

  return slots;
}

// --- ユーティリティ ---

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** スタッフの希望時間がスロットをカバーできるか判定 */
function canCoverSlot(entry: ParsedEntry, slot: TimeSlotDef): boolean {
  if (!entry.available) return false;
  if (!entry.startTime || !entry.endTime) {
    // 時間未指定で available=true → ○だけの人（時間不明）
    // 9:00-17:00に入れる想定
    const sStart = timeToMin(slot.start);
    const sEnd = timeToMin(slot.end);
    return sStart >= 9 * 60 && (sEnd <= 17 * 60 || slot.isOvernight === false);
  }

  const eStart = timeToMin(entry.startTime);
  let eEnd = timeToMin(entry.endTime);
  const sStart = timeToMin(slot.start);
  let sEnd = timeToMin(slot.end);

  // 日跨ぎ処理
  if (slot.isOvernight) sEnd += 24 * 60;
  if (eEnd <= eStart) eEnd += 24 * 60;

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

/**
 * @param parseResult LINEパース結果
 * @param timeSlotsOrMap 固定スロット配列 or 曜日別スロットMap（DBから生成）
 */
export function autoAssign(
  parseResult: ParseResult,
  timeSlotsOrMap?: TimeSlotDef[] | Map<number, TimeSlotDef[]>
): AssignResult {
  const { period, staff } = parseResult;
  const shifts: AssignedShift[] = [];
  const gaps: GapInfo[] = [];

  // 対象日のリスト（月の実日数を考慮）
  const startDay = period.half === 'first' ? 1 : 16;
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const endDay = period.half === 'first' ? 15 : daysInMonth;

  // スロット取得関数
  const getSlots = (day: number): TimeSlotDef[] => {
    if (!timeSlotsOrMap) return DEFAULT_TIME_SLOTS;
    if (Array.isArray(timeSlotsOrMap)) return timeSlotsOrMap;
    // Map<dayOfWeek, TimeSlotDef[]>
    const date = new Date(period.year, period.month - 1, day);
    const dow = date.getDay();
    return timeSlotsOrMap.get(dow) || DEFAULT_TIME_SLOTS;
  };

  // スタッフごとの配置回数カウント
  const assignCount = new Map<string, number>();
  staff.forEach(s => assignCount.set(s.name, 0));

  let totalSlots = 0;
  let filledSlots = 0;

  // 全スロットIDを集計（優先度付け用）
  // 埋まりにくい順: 夜勤系 → 早朝系 → 夕勤系 → 日勤系
  const slotPriority = (slotId: string): number => {
    if (slotId.includes('21:') || slotId.includes('22:') || slotId.includes('23:') || slotId.includes('00:')) return 0;
    if (slotId.includes('05:') || slotId.includes('06:') || slotId.includes('07:') || slotId.includes('08:')) return 1;
    if (slotId.includes('17:') || slotId.includes('18:') || slotId.includes('19:') || slotId.includes('20:')) return 2;
    return 3;
  };

  for (let day = startDay; day <= endDay; day++) {
    const daySlots = getSlots(day);

    // 埋まりにくい順にソート
    const sortedSlots = [...daySlots].sort((a, b) => slotPriority(a.id) - slotPriority(b.id));

    for (const slot of sortedSlots) {
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

        // この人がこの日にすでに配置されていないか
        const existingForDay = shifts.filter(
          s => s.staffName === candidate.staff.name && s.day === day
        );
        if (existingForDay.length > 0) continue;

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
