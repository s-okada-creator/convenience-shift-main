'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageSection } from '@/components/layout/dashboard-layout';
import {
  AlertTriangle, Printer, Megaphone, ChevronRight,
} from 'lucide-react';
import { timeToMinutes } from '@/lib/time-constants';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

interface Shift {
  id: number; staffId: number; date: string; startTime: string; endTime: string;
  staffName: string | null; staffEmploymentType: string | null;
}
interface Requirement { dayOfWeek: number; timeSlot: string; requiredCount: number; }

interface ShortageItem {
  date: string;
  dateLabel: string;
  timeRange: string;
  required: number;
  assigned: number;
  shortage: number;
}

interface PeriodOverviewProps {
  storeId: string;
  storeName: string;
  periodStart: string; // "2026-04-01"
  periodEnd: string;   // "2026-04-15"
  onNavigateToDay: (date: string) => void;
  onCreateHelpRequest: (date: string, startTime: string, endTime: string, shortage: number) => void;
}

export function PeriodOverview({
  storeId, storeName, periodStart, periodEnd, onNavigateToDay, onCreateHelpRequest,
}: PeriodOverviewProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  // 期間内の日付リスト
  const days = useMemo(() => {
    const result: string[] = [];
    const [sy, sm, sd] = periodStart.split('-').map(Number);
    const [ey, em, ed] = periodEnd.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return result;
  }, [periodStart, periodEnd]);

  // データ取得
  useEffect(() => {
    if (!storeId || days.length === 0) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/shifts?storeId=${storeId}&startDate=${periodStart}&endDate=${periodEnd}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/shift-requirements?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
    ]).then(([s, r]) => {
      setShifts(s);
      setRequirements(r);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [storeId, periodStart, periodEnd, days.length]);

  // スタッフ一覧（シフトが入ってる人だけ）
  const staffList = useMemo(() => {
    const map = new Map<string, { name: string; isEmployee: boolean }>();
    for (const s of shifts) {
      if (!s.staffName) continue;
      if (!map.has(s.staffName)) {
        map.set(s.staffName, { name: s.staffName, isEmployee: s.staffEmploymentType === 'employee' });
      }
    }
    // 社員を先に、バイトを後に
    return Array.from(map.values()).sort((a, b) => {
      if (a.isEmployee && !b.isEmployee) return -1;
      if (!a.isEmployee && b.isEmployee) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [shifts]);

  // 日付ごとのシフトマップ
  const shiftsByDateStaff = useMemo(() => {
    const map = new Map<string, string>(); // "date|name" → "09:00-17:00"
    for (const s of shifts) {
      if (!s.staffName) continue;
      const key = `${s.date}|${s.staffName}`;
      map.set(key, `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`);
    }
    return map;
  }, [shifts]);

  // 不足一覧（2週間分）
  const shortages = useMemo((): ShortageItem[] => {
    const result: ShortageItem[] = [];

    for (const date of days) {
      const [y, m, d] = date.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const dayReqs = requirements.filter(r => r.dayOfWeek === dow && r.requiredCount > 0);
      if (dayReqs.length === 0) continue;

      const dayShifts = shifts.filter(s => s.date === date);
      const dateLabel = `${m}/${d}（${DAY_NAMES[dow]}）`;

      // 30分スロットごとにチェック → 連続する不足をグルーピング
      let gapStart: string | null = null;
      let gapShortage = 0;

      for (let h = 0; h < 24; h++) {
        for (const min of [0, 30]) {
          const slot = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
          const req = dayReqs.find(r => r.timeSlot === slot);
          const required = req ? req.requiredCount : 0;
          if (required === 0) {
            if (gapStart) { result.push({ date, dateLabel, timeRange: `${gapStart}-${slot}`, required: gapShortage + gapShortage, assigned: 0, shortage: gapShortage }); gapStart = null; }
            continue;
          }

          const slotMin = h * 60 + min;
          const assigned = dayShifts.filter(s => {
            const sS = timeToMinutes(s.startTime.slice(0, 5));
            const sE = timeToMinutes(s.endTime.slice(0, 5));
            if (sE <= sS) return slotMin >= sS || slotMin + 30 <= sE;
            return sS < slotMin + 30 && sE > slotMin;
          }).length;

          const shortage = required - assigned;
          if (shortage > 0) {
            if (gapStart && gapShortage === shortage) { /* continue grouping */ }
            else {
              if (gapStart) result.push({ date, dateLabel, timeRange: `${gapStart}-${slot}`, required, assigned, shortage: gapShortage });
              gapStart = slot;
              gapShortage = shortage;
            }
          } else {
            if (gapStart) { result.push({ date, dateLabel, timeRange: `${gapStart}-${slot}`, required, assigned, shortage: gapShortage }); gapStart = null; }
          }
        }
      }
      if (gapStart) result.push({ date, dateLabel, timeRange: `${gapStart}-24:00`, required: 0, assigned: 0, shortage: gapShortage });
    }

    // 不足が大きい順にソート
    return result.sort((a, b) => b.shortage - a.shortage);
  }, [days, shifts, requirements]);

  // PDF印刷
  const handlePrint = useCallback(() => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const month = periodStart.split('-')[1];
    const startDay = periodStart.split('-')[2];
    const endDay = periodEnd.split('-')[2];

    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>シフト表 ${storeName} ${month}/${startDay}-${endDay}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10px; margin: 0; padding: 0; }
        h1 { font-size: 16px; margin: 0 0 4px 0; }
        .period { font-size: 12px; color: #666; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #ccc; padding: 3px 4px; text-align: center; font-size: 9px; overflow: hidden; }
        th { background: #f5f5f5; font-weight: bold; }
        th.name { width: 70px; text-align: left; }
        .sun { color: #FF3B30; }
        .sat { color: #007AFF; }
        .employee { background: #f0fff4; }
        .empty { color: #ccc; }
      </style>
    </head><body>`);

    // ヘッダー
    printWindow.document.write(`<h1>${storeName} シフト表</h1>`);
    printWindow.document.write(`<div class="period">${month}月${startDay}日〜${endDay}日</div>`);

    // テーブル
    printWindow.document.write('<table><thead><tr><th class="name">名前</th>');
    for (const date of days) {
      const [, , d] = date.split('-').map(Number);
      const [y, m] = date.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const cls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';
      printWindow.document.write(`<th class="${cls}">${d}(${DAY_NAMES[dow]})</th>`);
    }
    printWindow.document.write('</tr></thead><tbody>');

    for (const staff of staffList) {
      const cls = staff.isEmployee ? ' class="employee"' : '';
      printWindow.document.write(`<tr${cls}><th class="name">${staff.name}${staff.isEmployee ? '(社員)' : ''}</th>`);
      for (const date of days) {
        const shift = shiftsByDateStaff.get(`${date}|${staff.name}`);
        if (shift) {
          printWindow.document.write(`<td>${shift}</td>`);
        } else {
          printWindow.document.write('<td class="empty">-</td>');
        }
      }
      printWindow.document.write('</tr>');
    }

    printWindow.document.write('</tbody></table></body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }, [days, staffList, shiftsByDateStaff, storeName, periodStart, periodEnd]);

  if (loading) {
    return <PageSection><div className="animate-pulse space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-[#E5E5EA] rounded-xl" />)}</div></PageSection>;
  }

  return (
    <div ref={printRef}>
      {/* 不足一覧 */}
      {shortages.length > 0 && (
        <PageSection className="mb-4">
          <h3 className="text-sm font-bold text-[#FF3B30] mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            緊急度の高い人手不足（{shortages.length}件）
          </h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {shortages.slice(0, 20).map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-[#FF3B30]/5 border border-[#FF3B30]/10 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => onNavigateToDay(s.date)} className="text-sm font-medium text-[#007AFF] hover:underline">
                    {s.dateLabel}
                  </button>
                  <span className="text-sm text-[#1D1D1F]">{s.timeRange}</span>
                  <Badge variant="outline" className="text-xs border-[#FF3B30]/30 text-[#FF3B30]">
                    {s.shortage}人不足
                  </Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  const [start, end] = s.timeRange.split('-');
                  onCreateHelpRequest(s.date, start, end, s.shortage);
                }} className="rounded-lg text-xs border-[#FF9500] text-[#FF9500] hover:bg-[#FF9500]/5">
                  <Megaphone className="w-3 h-3 mr-1" />ヘルプ募集
                </Button>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {/* シフト表（2週間） */}
      <PageSection className="overflow-x-auto mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#1D1D1F]">
            シフト表（{periodStart.slice(5).replace('-', '/')} 〜 {periodEnd.slice(5).replace('-', '/')}）
          </h3>
          <Button size="sm" variant="outline" onClick={handlePrint} className="rounded-lg">
            <Printer className="w-4 h-4 mr-1" />PDF出力
          </Button>
        </div>

        <div className="min-w-[700px]">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-[#E5E5EA] bg-[#F5F5F7] px-2 py-1.5 text-left w-[80px] sticky left-0 z-10">名前</th>
                {days.map(date => {
                  const [y, m, d] = date.split('-').map(Number);
                  const dow = new Date(y, m - 1, d).getDay();
                  return (
                    <th key={date}
                      className={`border border-[#E5E5EA] bg-[#F5F5F7] px-1 py-1.5 text-center cursor-pointer hover:bg-[#007AFF]/10 ${
                        dow === 0 ? 'text-[#FF3B30]' : dow === 6 ? 'text-[#007AFF]' : ''
                      }`}
                      onClick={() => onNavigateToDay(date)}>
                      {d}<br /><span className="text-[8px]">{DAY_NAMES[dow]}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staffList.map(staff => (
                <tr key={staff.name} className={staff.isEmployee ? 'bg-[#34C759]/5' : ''}>
                  <td className="border border-[#E5E5EA] px-2 py-1 font-medium sticky left-0 bg-white z-10">
                    {staff.name}
                    {staff.isEmployee && <span className="text-[8px] text-[#34C759] ml-0.5">社</span>}
                  </td>
                  {days.map(date => {
                    const shift = shiftsByDateStaff.get(`${date}|${staff.name}`);
                    return (
                      <td key={date} className={`border border-[#E5E5EA] px-0.5 py-1 text-center ${shift ? 'text-[#1D1D1F]' : 'text-[#D2D2D7]'}`}>
                        {shift || '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {staffList.length === 0 && (
                <tr><td colSpan={days.length + 1} className="border border-[#E5E5EA] px-4 py-6 text-center text-[#D2D2D7]">シフトが登録されていません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageSection>
    </div>
  );
}
