/**
 * 時間関連の共通定数とユーティリティ
 * シフト管理全体で統一された時間処理を提供
 */

// 24時間対応の時間スロット（0:00〜23:30、30分単位、48スロット）
export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
})();

// 営業時間の開始・終了（表示用）
export const BUSINESS_HOURS = {
  start: '00:00',
  end: '23:30',
  slotsCount: 48,
} as const;

// デフォルトのシフト時間
export const DEFAULT_SHIFT = {
  startTime: '09:00',
  endTime: '17:00',
  duration: 3, // 新規作成時のデフォルト時間（時間）
} as const;

/**
 * 時刻文字列を分に変換
 * @param time "HH:mm" 形式の時刻
 * @returns 0:00からの経過分数
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * TIME_SLOTS上のインデックスを取得（24:00は末尾扱い）
 * @param time "HH:mm" 形式の時刻
 * @param slots 参照するスロット配列（省略時はTIME_SLOTS）
 */
export function getTimeSlotIndex(time: string, slots: string[] = TIME_SLOTS): number {
  if (time === '24:00') return slots.length;
  return slots.findIndex((t) => t === time);
}

/**
 * 分を時刻文字列に変換
 * @param minutes 0:00からの経過分数
 * @returns "HH:mm" 形式の時刻
 */
export function minutesToTime(minutes: number): string {
  // 24時間を超える場合は翌日として処理（0-1439の範囲に正規化）
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 時刻に指定時間を加算
 * @param time "HH:mm" 形式の時刻
 * @param hours 加算する時間（時）
 * @param maxTime 上限時刻（オプション、デフォルト: "23:30"）
 * @returns 加算後の時刻（maxTimeを超えない）
 */
export function addHoursToTime(time: string, hours: number, maxTime: string = '23:30'): string {
  const minutes = timeToMinutes(time);
  const addedMinutes = minutes + hours * 60;
  const maxMinutes = timeToMinutes(maxTime);

  const resultMinutes = Math.min(addedMinutes, maxMinutes);
  return minutesToTime(resultMinutes);
}

/**
 * 2つの時刻の間の時間を計算（時間単位）
 * @param startTime 開始時刻
 * @param endTime 終了時刻
 * @returns 時間数
 */
export function calculateDuration(startTime: string, endTime: string): number {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  return (endMinutes - startMinutes) / 60;
}

/**
 * 指定した時刻がシフト時間内かどうかを判定
 * @param time チェックする時刻
 * @param startTime シフト開始時刻
 * @param endTime シフト終了時刻
 * @returns シフト時間内ならtrue
 */
export function isTimeInShift(time: string, startTime: string, endTime: string): boolean {
  const timeMin = timeToMinutes(time);
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  return timeMin >= startMin && timeMin < endMin;
}

/**
 * 時刻を30分単位に丸める
 * @param time "HH:mm" 形式の時刻
 * @param mode 'floor' | 'ceil' | 'round'
 * @returns 30分単位に丸められた時刻
 */
export function roundToSlot(time: string, mode: 'floor' | 'ceil' | 'round' = 'round'): string {
  const minutes = timeToMinutes(time);
  let roundedMinutes: number;

  switch (mode) {
    case 'floor':
      roundedMinutes = Math.floor(minutes / 30) * 30;
      break;
    case 'ceil':
      roundedMinutes = Math.ceil(minutes / 30) * 30;
      break;
    case 'round':
    default:
      roundedMinutes = Math.round(minutes / 30) * 30;
      break;
  }

  return minutesToTime(roundedMinutes);
}

/**
 * 時間帯ラベルを取得（深夜、早朝、朝、昼、夕方、夜）
 * @param time "HH:mm" 形式の時刻
 * @returns 時間帯ラベル
 */
export function getTimePeriodLabel(time: string): string {
  const hour = parseInt(time.split(':')[0], 10);

  if (hour >= 0 && hour < 5) return '深夜';
  if (hour >= 5 && hour < 9) return '早朝';
  if (hour >= 9 && hour < 12) return '午前';
  if (hour >= 12 && hour < 14) return '昼';
  if (hour >= 14 && hour < 17) return '午後';
  if (hour >= 17 && hour < 21) return '夕方';
  return '夜';
}
