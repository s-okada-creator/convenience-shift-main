'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle,
  UserPlus, Pencil,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { timeToMinutes } from '@/lib/time-constants';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const TOTAL_MINUTES = 24 * 60;

// 1時間刻みの時間軸ラベル
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i);

// 15分刻みの時間選択肢
function generateTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  opts.push('24:00');
  return opts;
}
const TIME_OPTIONS = generateTimeOptions();

interface Store { id: number; name: string; }
interface Shift {
  id: number; staffId: number; storeId: number; date: string;
  startTime: string; endTime: string;
  staffName: string | null; staffRole: string | null; staffEmploymentType: string | null;
}
interface Requirement {
  id: number; storeId: number; dayOfWeek: number; timeSlot: string; requiredCount: number;
}

export function ShiftAdjustContent({ user }: { user: SessionUser }) {
  const getInitialDate = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const d = params.get('date');
      if (d) return d;
    }
    return new Date().toISOString().slice(0, 10);
  };

  const [currentDate, setCurrentDate] = useState(getInitialDate);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addStartTime, setAddStartTime] = useState('09:00');
  const [addEndTime, setAddEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);

  const dateObj = useMemo(() => new Date(currentDate + 'T00:00:00'), [currentDate]);
  const dayOfWeek = useMemo(() => dateObj.getDay(), [dateObj]);
  const dateLabel = useMemo(() => {
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    return `${m}/${d}（${DAY_NAMES[dayOfWeek]}）`;
  }, [dateObj, dayOfWeek]);

  // 期間表示
  const periodLabel = useMemo(() => {
    const d = dateObj;
    const y = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    if (day <= 15) return `${String(month).padStart(2, '0')}/01 〜 ${String(month).padStart(2, '0')}/15`;
    const lastDay = new Date(y, month, 0).getDate();
    return `${String(month).padStart(2, '0')}/16 〜 ${String(month).padStart(2, '0')}/${lastDay}`;
  }, [dateObj]);

  // データ取得
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/stores');
        if (res.ok) {
          const data: Store[] = await res.json();
          setStores(data);
          const def = user.storeId ? data.find(s => s.id === user.storeId) : data[0];
          if (def) setSelectedStoreId(String(def.id));
        }
      } catch { /* ignore */ }
    })();
  }, [user.storeId]);

  const fetchDayData = useCallback(async () => {
    if (!selectedStoreId || !currentDate) return;
    setLoading(true);
    try {
      const [shiftsRes, reqsRes] = await Promise.all([
        fetch(`/api/shifts?storeId=${selectedStoreId}&startDate=${currentDate}&endDate=${currentDate}`),
        fetch(`/api/shift-requirements?storeId=${selectedStoreId}&dayOfWeek=${dayOfWeek}`),
      ]);
      if (shiftsRes.ok) setShifts(await shiftsRes.json());
      if (reqsRes.ok) setRequirements(await reqsRes.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [selectedStoreId, currentDate, dayOfWeek]);

  useEffect(() => { fetchDayData(); }, [fetchDayData]);

  // 不足分析
  const gapMessages = useMemo(() => {
    if (requirements.length === 0) return [];
    const gaps: { startTime: string; endTime: string; shortage: number }[] = [];
    let gapStart: string | null = null;
    let gapShortage = 0;

    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const req = requirements.find(r => r.timeSlot === slot);
        const required = req ? req.requiredCount : 0;
        if (required === 0) {
          if (gapStart) { gaps.push({ startTime: gapStart, endTime: slot, shortage: gapShortage }); gapStart = null; }
          continue;
        }
        const slotMin = h * 60 + m;
        const assigned = shifts.filter(s => {
          let sStart = timeToMinutes(s.startTime.slice(0, 5));
          let sEnd = timeToMinutes(s.endTime.slice(0, 5));
          // 日跨ぎ: endTime < startTime なら翌日扱い
          if (sEnd <= sStart) {
            // 21:45-06:00 → 0:00-6:00の部分をカバーするかチェック
            if (slotMin >= sStart || slotMin + 30 <= sEnd) return true;
            return false;
          }
          return sStart < slotMin + 30 && sEnd > slotMin;
        }).length;

        const shortage = required - assigned;
        if (shortage > 0) {
          if (gapStart && gapShortage === shortage) { /* continue */ }
          else {
            if (gapStart) gaps.push({ startTime: gapStart, endTime: slot, shortage: gapShortage });
            gapStart = slot;
            gapShortage = shortage;
          }
        } else {
          if (gapStart) { gaps.push({ startTime: gapStart, endTime: slot, shortage: gapShortage }); gapStart = null; }
        }
      }
    }
    if (gapStart) gaps.push({ startTime: gapStart, endTime: '24:00', shortage: gapShortage });
    return gaps;
  }, [shifts, requirements]);

  // ナビゲーション
  const navigateDay = useCallback((direction: number) => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + direction);
    const newDate = d.toISOString().slice(0, 10);
    setCurrentDate(newDate);
    setShowAddForm(false);
    // URLも更新（リロードなし）
    window.history.replaceState(null, '', `/dashboard/shift-adjust?date=${newDate}`);
  }, [currentDate]);

  // 社員追加
  const handleAddShift = useCallback(async () => {
    if (!user.id || !selectedStoreId) return;
    setSaving(true);
    try {
      const staffRes = await fetch(`/api/staff?storeId=${selectedStoreId}`);
      const staffList = staffRes.ok ? await staffRes.json() : [];
      let staffId = staffList.find((s: { name: string }) => s.name === user.name)?.id;
      if (!staffId) {
        const employee = staffList.find((s: { employmentType: string }) => s.employmentType === 'employee');
        staffId = employee?.id || staffList[0]?.id;
      }
      if (!staffId) { alert('スタッフ情報が見つかりません'); setSaving(false); return; }

      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId, storeId: parseInt(selectedStoreId), date: currentDate,
          startTime: addStartTime, endTime: addEndTime,
        }),
      });
      if (res.ok) { setShowAddForm(false); fetchDayData(); }
      else { const err = await res.json(); alert(err.error || '登録に失敗しました'); }
    } catch { alert('登録に失敗しました'); }
    finally { setSaving(false); }
  }, [user, selectedStoreId, currentDate, addStartTime, addEndTime, fetchDayData]);

  // シフトが入っている人のみ
  const activeShifts = useMemo(() =>
    shifts.filter(s => s.staffName).sort((a, b) => {
      let aStart = timeToMinutes(a.startTime.slice(0, 5));
      let bStart = timeToMinutes(b.startTime.slice(0, 5));
      // 夜勤を後ろに
      if (aStart >= 21 * 60) aStart -= TOTAL_MINUTES;
      if (bStart >= 21 * 60) bStart -= TOTAL_MINUTES;
      return aStart - bStart;
    }),
    [shifts]
  );

  // 必要人数バー
  const requirementBar = useMemo(() => {
    const slots: { time: string; required: number; assigned: number }[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const req = requirements.find(r => r.timeSlot === slot);
        const required = req ? req.requiredCount : 0;
        const slotMin = h * 60 + m;
        const assigned = shifts.filter(s => {
          let sStart = timeToMinutes(s.startTime.slice(0, 5));
          let sEnd = timeToMinutes(s.endTime.slice(0, 5));
          if (sEnd <= sStart) {
            if (slotMin >= sStart || slotMin + 30 <= sEnd) return true;
            return false;
          }
          return sStart < slotMin + 30 && sEnd > slotMin;
        }).length;
        slots.push({ time: slot, required, assigned });
      }
    }
    return slots;
  }, [shifts, requirements]);

  /** シフトバーを描画（日跨ぎは2本に分割） */
  const renderShiftBars = useCallback((shift: Shift) => {
    const startMin = timeToMinutes(shift.startTime.slice(0, 5));
    const endMin = timeToMinutes(shift.endTime.slice(0, 5));
    const isEmployee = shift.staffEmploymentType === 'employee';
    const barColor = isEmployee ? 'bg-[#34C759]' : 'bg-[#007AFF]';

    if (endMin > startMin) {
      // 通常シフト（日跨ぎなし）
      const left = (startMin / TOTAL_MINUTES) * 100;
      const width = ((endMin - startMin) / TOTAL_MINUTES) * 100;
      const dur = endMin - startMin;
      return (
        <div key={shift.id} className={`absolute top-0.5 bottom-0.5 rounded-md flex items-center justify-center ${barColor}`}
          style={{ left: `${left}%`, width: `${width}%` }}>
          <span className="text-[10px] text-white font-medium truncate px-1">
            {shift.startTime.slice(0, 5)}-{shift.endTime.slice(0, 5)} ({Math.floor(dur / 60)}h{dur % 60 > 0 ? `${dur % 60}m` : ''})
          </span>
        </div>
      );
    } else {
      // 日跨ぎシフト（21:45-06:00等）→ 2本に分割
      const dur = (TOTAL_MINUTES - startMin) + endMin;
      const label = `${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)} (${Math.floor(dur / 60)}h${dur % 60 > 0 ? `${dur % 60}m` : ''})`;

      // 前半: startMin → 24:00
      const left1 = (startMin / TOTAL_MINUTES) * 100;
      const width1 = ((TOTAL_MINUTES - startMin) / TOTAL_MINUTES) * 100;
      // 後半: 0:00 → endMin
      const width2 = (endMin / TOTAL_MINUTES) * 100;

      return (
        <>
          <div key={`${shift.id}-a`} className={`absolute top-0.5 bottom-0.5 rounded-l-md flex items-center justify-end ${barColor}`}
            style={{ left: `${left1}%`, width: `${width1}%` }}>
            <span className="text-[10px] text-white font-medium truncate px-1">{label}</span>
          </div>
          {endMin > 0 && (
            <div key={`${shift.id}-b`} className={`absolute top-0.5 bottom-0.5 rounded-r-md ${barColor}`}
              style={{ left: '0%', width: `${width2}%` }} />
          )}
        </>
      );
    }
  }, []);

  return (
    <DashboardLayout user={user} title="シフト微調整" description="1日ずつ確認して社員シフトを追加"
      actions={stores.length > 1 ? (
        <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
          <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white"><SelectValue placeholder="店舗を選択" /></SelectTrigger>
          <SelectContent>{stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : undefined}
    >
      {/* 日付ナビ */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" onClick={() => navigateDay(-1)} className="rounded-xl h-12 w-12">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div className="text-center">
          <h2 className={`text-2xl font-bold ${dayOfWeek === 0 ? 'text-[#FF3B30]' : dayOfWeek === 6 ? 'text-[#007AFF]' : 'text-[#1D1D1F]'}`}>
            {dateLabel}
          </h2>
          <p className="text-xs text-[#86868B]">期間: {periodLabel}</p>
        </div>
        <Button variant="outline" onClick={() => navigateDay(1)} className="rounded-xl h-12 w-12">
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>

      {loading ? (
        <PageSection><div className="animate-pulse space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-[#E5E5EA] rounded-xl" />)}</div></PageSection>
      ) : (
        <>
          {/* 不足メッセージ */}
          {gapMessages.length > 0 ? (
            <div className="bg-[#FF3B30]/5 border border-[#FF3B30]/20 rounded-2xl p-4 mb-4">
              <h3 className="text-sm font-bold text-[#FF3B30] mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />人手が足りない時間帯
              </h3>
              <div className="space-y-1">
                {gapMessages.map((g, i) => (
                  <p key={i} className="text-sm text-[#FF3B30]">{g.startTime}〜{g.endTime} あと{g.shortage}人</p>
                ))}
              </div>
            </div>
          ) : requirements.length > 0 ? (
            <div className="bg-[#34C759]/5 border border-[#34C759]/20 rounded-2xl p-4 mb-4">
              <p className="text-sm text-[#34C759] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />この日は人員が充足しています
              </p>
            </div>
          ) : null}

          {/* タイムライン */}
          <PageSection className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* 1時間刻みの時間軸 */}
              <div className="flex items-end mb-1" style={{ marginLeft: '110px' }}>
                {HOUR_LABELS.map(h => (
                  <div key={h} className="text-[9px] text-[#86868B] border-l border-[#E5E5EA]/50"
                    style={{ width: `${(1 / 24) * 100}%`, paddingLeft: '2px' }}>
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>

              {/* 必要人数バー */}
              <div className="flex items-center mb-3">
                <div className="w-[110px] flex-shrink-0 pr-2">
                  <span className="text-[10px] text-[#86868B]">必要人数</span>
                </div>
                <div className="flex-1 flex h-5 rounded-md overflow-hidden bg-[#F5F5F7]">
                  {requirementBar.map((slot, i) => {
                    const isFull = slot.assigned >= slot.required;
                    const isEmpty = slot.required === 0;
                    return (
                      <div key={i}
                        className={`h-full flex items-center justify-center ${
                          isEmpty ? 'bg-[#F5F5F7]' : isFull ? 'bg-[#34C759]/30' : 'bg-[#FF3B30]/20'
                        }`}
                        style={{ width: `${(1 / 48) * 100}%`, borderRight: i % 2 === 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}
                        title={`${slot.time}: ${slot.assigned}/${slot.required}人`}
                      >
                        {i % 2 === 0 && slot.required > 0 && (
                          <span className={`text-[7px] font-bold ${isFull ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                            {slot.assigned}/{slot.required}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* シフトバー */}
              {activeShifts.length > 0 ? (
                <div className="space-y-1.5">
                  {activeShifts.map(shift => {
                    const isEmployee = shift.staffEmploymentType === 'employee';
                    return (
                      <div key={shift.id} className="flex items-center">
                        <div className="w-[110px] flex-shrink-0 pr-2">
                          <p className="text-sm font-medium text-[#1D1D1F] truncate">{shift.staffName}</p>
                          <p className="text-[10px] text-[#86868B]">{isEmployee ? '社員' : 'バイト'}</p>
                        </div>
                        <div className="flex-1 relative h-8 bg-[#F5F5F7] rounded-md">
                          {renderShiftBars(shift)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[#D2D2D7] text-center py-6">この日はシフトが登録されていません</p>
              )}
            </div>
          </PageSection>

          {/* 社員追加 */}
          <div className="mt-4">
            {!showAddForm ? (
              <Button onClick={() => setShowAddForm(true)} className="w-full bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl h-12">
                <UserPlus className="w-5 h-5 mr-2" />自分のシフトを追加
              </Button>
            ) : (
              <PageSection>
                <h3 className="text-sm font-bold text-[#1D1D1F] mb-3 flex items-center gap-1.5">
                  <Pencil className="w-4 h-4 text-[#007AFF]" />シフトを追加（{user.name}）
                </h3>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1">
                    <label className="text-xs text-[#86868B] mb-1 block">開始</label>
                    <Select value={addStartTime} onValueChange={setAddStartTime}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.filter(t => t !== '24:00').map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-4 text-[#86868B]">〜</div>
                  <div className="flex-1">
                    <label className="text-xs text-[#86868B] mb-1 block">終了</label>
                    <Select value={addEndTime} onValueChange={setAddEndTime}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.filter(t => t !== '00:00').map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {gapMessages.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-[#86868B] mb-2">不足時間帯をタップで選択:</p>
                    <div className="flex flex-wrap gap-2">
                      {gapMessages.map((g, i) => (
                        <button key={i} onClick={() => { setAddStartTime(g.startTime); setAddEndTime(g.endTime); }}
                          className="px-3 py-1.5 rounded-lg bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/20 transition-colors">
                          {g.startTime}-{g.endTime}（-{g.shortage}人）
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleAddShift} disabled={saving} className="flex-1 bg-[#34C759] hover:bg-[#2DB84E] text-white rounded-xl">
                    {saving ? '登録中...' : '登録する'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddForm(false)} className="rounded-xl">キャンセル</Button>
                </div>
              </PageSection>
            )}
          </div>

          {/* 次の日ボタン */}
          <div className="mt-4 mb-8">
            <Button onClick={() => navigateDay(1)} className="w-full rounded-xl h-14 text-lg bg-[#007AFF] hover:bg-[#0056CC] text-white">
              次の日へ <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
