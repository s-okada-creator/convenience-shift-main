import { describe, it, expect } from 'vitest';
import {
  TIME_SLOTS,
  BUSINESS_HOURS,
  timeToMinutes,
  minutesToTime,
  addHoursToTime,
  calculateDuration,
  isTimeInShift,
  roundToSlot,
  getTimePeriodLabel,
} from '@/lib/time-constants';

describe('TIME_SLOTS', () => {
  it('48個のスロットを持つ', () => {
    expect(TIME_SLOTS).toHaveLength(48);
  });

  it('00:00から始まる', () => {
    expect(TIME_SLOTS[0]).toBe('00:00');
  });

  it('23:30で終わる', () => {
    expect(TIME_SLOTS[47]).toBe('23:30');
  });

  it('30分単位で増加する', () => {
    expect(TIME_SLOTS[1]).toBe('00:30');
    expect(TIME_SLOTS[2]).toBe('01:00');
    expect(TIME_SLOTS[3]).toBe('01:30');
  });
});

describe('timeToMinutes', () => {
  it('00:00を0分に変換', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('01:00を60分に変換', () => {
    expect(timeToMinutes('01:00')).toBe(60);
  });

  it('09:30を570分に変換', () => {
    expect(timeToMinutes('09:30')).toBe(570);
  });

  it('23:30を1410分に変換', () => {
    expect(timeToMinutes('23:30')).toBe(1410);
  });

  it('12:45を765分に変換', () => {
    expect(timeToMinutes('12:45')).toBe(765);
  });
});

describe('minutesToTime', () => {
  it('0分を00:00に変換', () => {
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('60分を01:00に変換', () => {
    expect(minutesToTime(60)).toBe('01:00');
  });

  it('570分を09:30に変換', () => {
    expect(minutesToTime(570)).toBe('09:30');
  });

  it('1410分を23:30に変換', () => {
    expect(minutesToTime(1410)).toBe('23:30');
  });

  it('24時間を超える場合は翌日として処理', () => {
    expect(minutesToTime(1440)).toBe('00:00'); // 24:00 -> 00:00
    expect(minutesToTime(1500)).toBe('01:00'); // 25:00 -> 01:00
  });

  it('負の値も正しく処理', () => {
    expect(minutesToTime(-60)).toBe('23:00'); // -1時間 -> 23:00
  });
});

describe('addHoursToTime', () => {
  it('時間を正しく加算', () => {
    expect(addHoursToTime('09:00', 3)).toBe('12:00');
  });

  it('maxTimeを超えない', () => {
    expect(addHoursToTime('22:00', 5)).toBe('23:30');
  });

  it('カスタムmaxTimeを使用', () => {
    expect(addHoursToTime('20:00', 5, '22:00')).toBe('22:00');
  });

  it('30分単位でも正しく動作', () => {
    expect(addHoursToTime('09:30', 2)).toBe('11:30');
  });
});

describe('calculateDuration', () => {
  it('シフト時間を正しく計算', () => {
    expect(calculateDuration('09:00', '17:00')).toBe(8);
  });

  it('短いシフトも計算', () => {
    expect(calculateDuration('10:00', '14:00')).toBe(4);
  });

  it('30分単位も計算', () => {
    expect(calculateDuration('09:30', '12:00')).toBe(2.5);
  });
});

describe('isTimeInShift', () => {
  it('シフト時間内ならtrueを返す', () => {
    expect(isTimeInShift('10:00', '09:00', '17:00')).toBe(true);
  });

  it('開始時刻ちょうどはtrueを返す', () => {
    expect(isTimeInShift('09:00', '09:00', '17:00')).toBe(true);
  });

  it('終了時刻ちょうどはfalseを返す', () => {
    expect(isTimeInShift('17:00', '09:00', '17:00')).toBe(false);
  });

  it('シフト時間外ならfalseを返す', () => {
    expect(isTimeInShift('08:00', '09:00', '17:00')).toBe(false);
    expect(isTimeInShift('18:00', '09:00', '17:00')).toBe(false);
  });
});

describe('roundToSlot', () => {
  it('floorモードで切り捨て', () => {
    expect(roundToSlot('09:15', 'floor')).toBe('09:00');
    expect(roundToSlot('09:45', 'floor')).toBe('09:30');
  });

  it('ceilモードで切り上げ', () => {
    expect(roundToSlot('09:15', 'ceil')).toBe('09:30');
    expect(roundToSlot('09:45', 'ceil')).toBe('10:00');
  });

  it('roundモードで四捨五入', () => {
    expect(roundToSlot('09:10', 'round')).toBe('09:00');
    expect(roundToSlot('09:20', 'round')).toBe('09:30');
  });

  it('30分ちょうどはそのまま', () => {
    expect(roundToSlot('09:30', 'floor')).toBe('09:30');
    expect(roundToSlot('09:30', 'ceil')).toBe('09:30');
    expect(roundToSlot('09:30', 'round')).toBe('09:30');
  });
});

describe('getTimePeriodLabel', () => {
  it('深夜（0-5時）', () => {
    expect(getTimePeriodLabel('00:00')).toBe('深夜');
    expect(getTimePeriodLabel('04:30')).toBe('深夜');
  });

  it('早朝（5-9時）', () => {
    expect(getTimePeriodLabel('05:00')).toBe('早朝');
    expect(getTimePeriodLabel('08:30')).toBe('早朝');
  });

  it('午前（9-12時）', () => {
    expect(getTimePeriodLabel('09:00')).toBe('午前');
    expect(getTimePeriodLabel('11:30')).toBe('午前');
  });

  it('昼（12-14時）', () => {
    expect(getTimePeriodLabel('12:00')).toBe('昼');
    expect(getTimePeriodLabel('13:30')).toBe('昼');
  });

  it('午後（14-17時）', () => {
    expect(getTimePeriodLabel('14:00')).toBe('午後');
    expect(getTimePeriodLabel('16:30')).toBe('午後');
  });

  it('夕方（17-21時）', () => {
    expect(getTimePeriodLabel('17:00')).toBe('夕方');
    expect(getTimePeriodLabel('20:30')).toBe('夕方');
  });

  it('夜（21-24時）', () => {
    expect(getTimePeriodLabel('21:00')).toBe('夜');
    expect(getTimePeriodLabel('23:30')).toBe('夜');
  });
});
