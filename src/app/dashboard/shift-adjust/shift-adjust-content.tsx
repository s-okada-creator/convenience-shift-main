'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle,
  UserPlus, Pencil, Trash2, X,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { timeToMinutes } from '@/lib/time-constants';
import { PeriodOverview } from './period-overview';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const TOTAL_MINUTES = 24 * 60;
const SNAP_MINUTES = 15; // 15分刻み
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i);

function minToTime(m: number): string {
  const normalized = ((m % TOTAL_MINUTES) + TOTAL_MINUTES) % TOTAL_MINUTES;
  const h = Math.floor(normalized / 60);
  const min = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function generateTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
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
interface Requirement { id: number; storeId: number; dayOfWeek: number; timeSlot: string; requiredCount: number; }

// ===== ドラッグリサイズ可能なシフトバー =====
function ResizableShiftBar({
  shift, isEmployee, isEditing,
  onStartEdit, onUpdate,
}: {
  shift: Shift;
  isEmployee: boolean; isEditing: boolean;
  onStartEdit: () => void;
  onUpdate: (id: number, startTime: string, endTime: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const startMin = timeToMinutes(shift.startTime.slice(0, 5));
  const endMin = timeToMinutes(shift.endTime.slice(0, 5));
  const isOvernight = endMin <= startMin;

  const initEnd = isOvernight ? endMin + TOTAL_MINUTES : endMin;
  const [tempStart, setTempStart] = useState(startMin);
  const [tempEnd, setTempEnd] = useState(initEnd);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  const displayStart = dragging ? tempStart : startMin;
  const displayEnd = dragging ? tempEnd : initEnd;

  const tempStartRef = useRef(startMin);
  const tempEndRef = useRef(initEnd);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- ref sync
  useEffect(() => { tempStartRef.current = displayStart; tempEndRef.current = displayEnd; }, [displayStart, displayEnd]);

  const barColor = isEmployee ? 'bg-[#34C759]' : 'bg-[#007AFF]';

  const handlePointerDown = useCallback((side: 'left' | 'right', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(side);

    // 親要素（relative containerのdiv）から幅を取得
    const container = barRef.current?.parentElement;
    if (!container) return;

    const containerWidth = container.getBoundingClientRect().width;
    const startX = e.clientX;
    const origStart = tempStartRef.current;
    const origEnd = tempEndRef.current;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dMin = (dx / containerWidth) * TOTAL_MINUTES;

      if (side === 'left') {
        let newStart = snapToGrid(origStart + dMin);
        newStart = Math.max(0, Math.min(newStart, origEnd - 30));
        setTempStart(newStart);
        tempStartRef.current = newStart;
      } else {
        let newEnd = snapToGrid(origEnd + dMin);
        newEnd = Math.max(origStart + 30, Math.min(newEnd, TOTAL_MINUTES + 6 * 60));
        setTempEnd(newEnd);
        tempEndRef.current = newEnd;
      }
    };

    const handleUp = () => {
      setDragging(null);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);

      const s = tempStartRef.current;
      const e = tempEndRef.current;
      const startStr = minToTime(s);
      const endStr = e >= TOTAL_MINUTES ? minToTime(e - TOTAL_MINUTES) : minToTime(e);
      onUpdate(shift.id, startStr, endStr);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [shift.id, onUpdate]);

  // 通常シフト or 日跨ぎで分けて描画
  if (displayEnd <= TOTAL_MINUTES) {
    // 通常
    const left = (displayStart / TOTAL_MINUTES) * 100;
    const width = ((displayEnd - displayStart) / TOTAL_MINUTES) * 100;
    const dur = displayEnd - displayStart;

    return (
      <div ref={barRef}
        className={`absolute top-0.5 bottom-0.5 rounded-md flex items-center ${barColor} ${isEditing ? 'ring-2 ring-[#FF9500] ring-offset-1' : ''} ${dragging ? 'opacity-80' : ''}`}
        style={{ left: `${left}%`, width: `${width}%`, zIndex: dragging ? 20 : 10 }}
      >
        {/* 左ハンドル */}
        <div className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 touch-none flex items-center justify-center"
          onPointerDown={e => handlePointerDown('left', e)}>
          <div className="w-0.5 h-3 bg-white/60 rounded" />
        </div>
        {/* 中央 */}
        <div className="flex-1 flex items-center justify-center min-w-0 cursor-pointer" onClick={onStartEdit}>
          <span className="text-[10px] text-white font-medium truncate px-3">
            {minToTime(displayStart)}-{displayEnd >= TOTAL_MINUTES ? minToTime(displayEnd - TOTAL_MINUTES) : minToTime(displayEnd)} ({Math.floor(dur / 60)}h{dur % 60 > 0 ? `${dur % 60}m` : ''})
          </span>
        </div>
        {/* 右ハンドル */}
        <div className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 touch-none flex items-center justify-center"
          onPointerDown={e => handlePointerDown('right', e)}>
          <div className="w-0.5 h-3 bg-white/60 rounded" />
        </div>
      </div>
    );
  } else {
    // 日跨ぎ: 2本に分割
    const left1 = (displayStart / TOTAL_MINUTES) * 100;
    const width1 = ((TOTAL_MINUTES - displayStart) / TOTAL_MINUTES) * 100;
    const actualEnd = displayEnd - TOTAL_MINUTES;
    const width2 = (actualEnd / TOTAL_MINUTES) * 100;
    const dur = displayEnd - displayStart;

    return (
      <>
        <div className={`absolute top-0.5 bottom-0.5 rounded-l-md flex items-center ${barColor} ${isEditing ? 'ring-2 ring-[#FF9500]' : ''}`}
          style={{ left: `${left1}%`, width: `${width1}%`, zIndex: dragging ? 20 : 10 }}>
          <div className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 touch-none flex items-center justify-center"
            onPointerDown={e => handlePointerDown('left', e)}>
            <div className="w-0.5 h-3 bg-white/60 rounded" />
          </div>
          <div className="flex-1 flex items-center justify-center cursor-pointer" onClick={onStartEdit}>
            <span className="text-[10px] text-white font-medium truncate px-3">
              {minToTime(displayStart)}-{minToTime(actualEnd)} ({Math.floor(dur / 60)}h{dur % 60 > 0 ? `${dur % 60}m` : ''})
            </span>
          </div>
        </div>
        {actualEnd > 0 && (
          <div className={`absolute top-0.5 bottom-0.5 rounded-r-md ${barColor} ${isEditing ? 'ring-2 ring-[#FF9500]' : ''}`}
            style={{ left: '0%', width: `${width2}%`, zIndex: dragging ? 20 : 10 }}>
            <div className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 touch-none flex items-center justify-center"
              onPointerDown={e => handlePointerDown('right', e)}>
              <div className="w-0.5 h-3 bg-white/60 rounded" />
            </div>
          </div>
        )}
      </>
    );
  }
}

// ===== メインコンポーネント =====
export function ShiftAdjustContent({ user }: { user: SessionUser }) {
  const getInitialDate = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const d = params.get('date');
      if (d) return d;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const [currentDate, setCurrentDate] = useState(getInitialDate);
  const [viewMode, setViewMode] = useState<'overview' | 'daily'>('overview');
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addStartTime, setAddStartTime] = useState('09:00');
  const [addEndTime, setAddEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);

  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const dateObj = useMemo(() => { const [y, m, d] = currentDate.split('-').map(Number); return new Date(y, m - 1, d); }, [currentDate]);
  const dayOfWeek = useMemo(() => dateObj.getDay(), [dateObj]);
  const dateLabel = useMemo(() => `${dateObj.getMonth() + 1}/${dateObj.getDate()}（${DAY_NAMES[dayOfWeek]}）`, [dateObj, dayOfWeek]);
  const periodLabel = useMemo(() => {
    const y = dateObj.getFullYear(); const month = dateObj.getMonth() + 1; const day = dateObj.getDate();
    const ms = String(month).padStart(2, '0');
    if (day <= 15) return `${ms}/01 〜 ${ms}/15`;
    return `${ms}/16 〜 ${ms}/${new Date(y, month, 0).getDate()}`;
  }, [dateObj]);

  // 期間の開始日・終了日（概要表示用）
  const periodDates = useMemo(() => {
    const y = dateObj.getFullYear(); const month = dateObj.getMonth() + 1; const day = dateObj.getDate();
    const ms = String(month).padStart(2, '0');
    if (day <= 15) return { start: `${y}-${ms}-01`, end: `${y}-${ms}-15` };
    const lastDay = new Date(y, month, 0).getDate();
    return { start: `${y}-${ms}-16`, end: `${y}-${ms}-${lastDay}` };
  }, [dateObj]);

  useEffect(() => {
    (async () => {
      try { const res = await fetch('/api/stores'); if (res.ok) { const data: Store[] = await res.json(); setStores(data);
        const def = user.storeId ? data.find(s => s.id === user.storeId) : data[0]; if (def) setSelectedStoreId(String(def.id)); }
      } catch { /* ignore */ }
    })();
  }, [user.storeId]);

  const fetchDayData = useCallback(async () => {
    if (!selectedStoreId || !currentDate) return;
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`/api/shifts?storeId=${selectedStoreId}&startDate=${currentDate}&endDate=${currentDate}`),
        fetch(`/api/shift-requirements?storeId=${selectedStoreId}&dayOfWeek=${dayOfWeek}`),
      ]);
      if (sRes.ok) setShifts(await sRes.json());
      if (rRes.ok) setRequirements(await rRes.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [selectedStoreId, currentDate, dayOfWeek]);

  useEffect(() => { fetchDayData(); }, [fetchDayData]);

  const gapMessages = useMemo(() => {
    if (requirements.length === 0) return [];
    const gaps: { startTime: string; endTime: string; shortage: number }[] = [];
    let gapStart: string | null = null; let gapShortage = 0;
    for (let h = 0; h < 24; h++) { for (const m of [0, 30]) {
      const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const req = requirements.find(r => r.timeSlot === slot); const required = req ? req.requiredCount : 0;
      if (required === 0) { if (gapStart) { gaps.push({ startTime: gapStart, endTime: slot, shortage: gapShortage }); gapStart = null; } continue; }
      const slotMin = h * 60 + m;
      const assigned = shifts.filter(s => { const sS = timeToMinutes(s.startTime.slice(0, 5)); const sE = timeToMinutes(s.endTime.slice(0, 5));
        if (sE <= sS) return slotMin >= sS || slotMin + 30 <= sE; return sS < slotMin + 30 && sE > slotMin; }).length;
      const shortage = required - assigned;
      if (shortage > 0) { if (gapStart && gapShortage === shortage) {} else { if (gapStart) gaps.push({ startTime: gapStart, endTime: slot, shortage: gapShortage }); gapStart = slot; gapShortage = shortage; } }
      else { if (gapStart) { gaps.push({ startTime: gapStart, endTime: slot, shortage: gapShortage }); gapStart = null; } }
    } }
    if (gapStart) gaps.push({ startTime: gapStart, endTime: '24:00', shortage: gapShortage });
    return gaps;
  }, [shifts, requirements]);

  const navigateDay = useCallback((direction: number) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + direction);
    const newDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setCurrentDate(newDate); setShowAddForm(false); setEditingShift(null);
    window.history.replaceState(null, '', `/dashboard/shift-adjust?date=${newDate}`);
  }, [currentDate]);

  const handleAddShift = useCallback(async () => {
    if (!user.id || !selectedStoreId) return; setSaving(true);
    try {
      const sRes = await fetch(`/api/staff?storeId=${selectedStoreId}`); const sList = sRes.ok ? await sRes.json() : [];
      let staffId = sList.find((s: { name: string }) => s.name === user.name)?.id;
      if (!staffId) { const emp = sList.find((s: { employmentType: string }) => s.employmentType === 'employee'); staffId = emp?.id || sList[0]?.id; }
      if (!staffId) { alert('スタッフ情報が見つかりません'); setSaving(false); return; }
      const res = await fetch('/api/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, storeId: parseInt(selectedStoreId), date: currentDate, startTime: addStartTime, endTime: addEndTime }) });
      if (res.ok) { setShowAddForm(false); fetchDayData(); } else { const err = await res.json(); alert(err.error || '登録に失敗しました'); }
    } catch { alert('登録に失敗しました'); } finally { setSaving(false); }
  }, [user, selectedStoreId, currentDate, addStartTime, addEndTime, fetchDayData]);

  // ドラッグで時間変更 → API保存
  const handleShiftUpdate = useCallback(async (shiftId: number, startTime: string, endTime: string) => {
    try {
      await fetch(`/api/shifts/${shiftId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime, endTime }) });
      fetchDayData();
    } catch { /* ignore */ }
  }, [fetchDayData]);

  const handleDeleteShift = useCallback(async (shiftId: number) => {
    if (!confirm('このシフトを削除しますか？')) return;
    try { const res = await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' });
      if (res.ok) { setEditingShift(null); fetchDayData(); } else alert('削除に失敗しました');
    } catch { alert('削除に失敗しました'); }
  }, [fetchDayData]);

  const activeShifts = useMemo(() => shifts.filter(s => s.staffName).sort((a, b) => {
    let aS = timeToMinutes(a.startTime.slice(0, 5)); let bS = timeToMinutes(b.startTime.slice(0, 5));
    if (aS >= 21 * 60) aS -= TOTAL_MINUTES; if (bS >= 21 * 60) bS -= TOTAL_MINUTES; return aS - bS;
  }), [shifts]);

  const requirementBar = useMemo(() => {
    const slots: { time: string; required: number; assigned: number }[] = [];
    for (let h = 0; h < 24; h++) { for (const m of [0, 30]) {
      const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const req = requirements.find(r => r.timeSlot === slot); const required = req ? req.requiredCount : 0;
      const slotMin = h * 60 + m;
      const assigned = shifts.filter(s => { const sS = timeToMinutes(s.startTime.slice(0, 5)); const sE = timeToMinutes(s.endTime.slice(0, 5));
        if (sE <= sS) return slotMin >= sS || slotMin + 30 <= sE; return sS < slotMin + 30 && sE > slotMin; }).length;
      slots.push({ time: slot, required, assigned });
    } }
    return slots;
  }, [shifts, requirements]);

  // ヘルプ募集作成
  const handleCreateHelpRequest = useCallback(async (date: string, startTime: string, endTime: string, shortage: number) => {
    if (!selectedStoreId) return;
    try {
      const staffRes = await fetch(`/api/staff?storeId=${selectedStoreId}`);
      const staffList = staffRes.ok ? await staffRes.json() : [];
      const manager = staffList.find((s: { employmentType: string }) => s.employmentType === 'employee');
      if (!manager) { alert('社員が登録されていないためヘルプ募集を作成できません'); return; }

      const res = await fetch('/api/help-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: parseInt(selectedStoreId),
          requestedBy: manager.id,
          needDate: date,
          needStart: startTime,
          needEnd: endTime,
          memo: `${shortage}人不足`,
          offerType: 'emergency',
        }),
      });
      if (res.ok) alert('ヘルプ募集を作成しました');
      else alert('ヘルプ募集の作成に失敗しました');
    } catch { alert('エラーが発生しました'); }
  }, [selectedStoreId]);

  // 概要から日別に遷移
  const handleNavigateToDay = useCallback((date: string) => {
    setCurrentDate(date);
    setViewMode('daily');
    window.history.replaceState(null, '', `/dashboard/shift-adjust?date=${date}`);
  }, []);

  return (
    <DashboardLayout user={user} title="シフト微調整" description="2週間の概要確認・PDF出力・1日ずつ編集"
      actions={stores.length > 1 ? (
        <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
          <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white"><SelectValue placeholder="店舗を選択" /></SelectTrigger>
          <SelectContent>{stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : undefined}>

      {/* モード切替タブ */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={viewMode === 'overview' ? 'default' : 'outline'}
          onClick={() => setViewMode('overview')}
          className={`rounded-xl ${viewMode === 'overview' ? 'bg-[#007AFF] text-white' : ''}`}
        >
          2週間概要
        </Button>
        <Button
          variant={viewMode === 'daily' ? 'default' : 'outline'}
          onClick={() => setViewMode('daily')}
          className={`rounded-xl ${viewMode === 'daily' ? 'bg-[#007AFF] text-white' : ''}`}
        >
          1日ずつ編集
        </Button>
      </div>

      {/* ===== 概要モード ===== */}
      {viewMode === 'overview' && selectedStoreId && (
        <PeriodOverview
          storeId={selectedStoreId}
          storeName={stores.find(s => String(s.id) === selectedStoreId)?.name || ''}
          periodStart={periodDates.start}
          periodEnd={periodDates.end}
          onNavigateToDay={handleNavigateToDay}
          onCreateHelpRequest={handleCreateHelpRequest}
        />
      )}

      {/* ===== 日別モード ===== */}
      {viewMode === 'daily' && (
        <>
      {/* 日付ナビ */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" onClick={() => navigateDay(-1)} className="rounded-xl h-12 w-12"><ChevronLeft className="w-6 h-6" /></Button>
        <div className="text-center">
          <h2 className={`text-2xl font-bold ${dayOfWeek === 0 ? 'text-[#FF3B30]' : dayOfWeek === 6 ? 'text-[#007AFF]' : 'text-[#1D1D1F]'}`}>{dateLabel}</h2>
          <p className="text-xs text-[#86868B]">期間: {periodLabel}</p>
        </div>
        <Button variant="outline" onClick={() => navigateDay(1)} className="rounded-xl h-12 w-12"><ChevronRight className="w-6 h-6" /></Button>
      </div>

      {loading ? (
        <PageSection><div className="animate-pulse space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-[#E5E5EA] rounded-xl" />)}</div></PageSection>
      ) : (
        <>
          {gapMessages.length > 0 ? (
            <div className="bg-[#FF3B30]/5 border border-[#FF3B30]/20 rounded-2xl p-4 mb-4">
              <h3 className="text-sm font-bold text-[#FF3B30] mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />人手が足りない時間帯</h3>
              {gapMessages.map((g, i) => <p key={i} className="text-sm text-[#FF3B30]">{g.startTime}〜{g.endTime} あと{g.shortage}人</p>)}
            </div>
          ) : requirements.length > 0 ? (
            <div className="bg-[#34C759]/5 border border-[#34C759]/20 rounded-2xl p-4 mb-4">
              <p className="text-sm text-[#34C759] font-medium flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />この日は人員が充足しています</p>
            </div>
          ) : null}

          <PageSection className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="flex items-end mb-1" style={{ marginLeft: '110px' }}>
                {HOUR_LABELS.map(h => (
                  <div key={h} className="text-[9px] text-[#86868B] border-l border-[#E5E5EA]/50" style={{ width: `${(1 / 24) * 100}%`, paddingLeft: '2px' }}>{String(h).padStart(2, '0')}</div>
                ))}
              </div>

              <div className="flex items-center mb-3">
                <div className="w-[110px] flex-shrink-0 pr-2"><span className="text-[10px] text-[#86868B]">必要人数</span></div>
                <div className="flex-1 flex h-5 rounded-md overflow-hidden bg-[#F5F5F7]">
                  {requirementBar.map((slot, i) => {
                    const isFull = slot.assigned >= slot.required; const isEmpty = slot.required === 0;
                    return (
                      <div key={i} className={`h-full flex items-center justify-center ${isEmpty ? 'bg-[#F5F5F7]' : isFull ? 'bg-[#34C759]/30' : 'bg-[#FF3B30]/20'}`}
                        style={{ width: `${(1 / 48) * 100}%`, borderRight: i % 2 === 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                        {i % 2 === 0 && slot.required > 0 && <span className={`text-[7px] font-bold ${isFull ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>{slot.assigned}/{slot.required}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {activeShifts.length > 0 ? (
                <div className="space-y-1.5">
                  {activeShifts.map(shift => (
                    <div key={shift.id} className="flex items-center">
                      <div className="w-[110px] flex-shrink-0 pr-2">
                        <p className="text-sm font-medium text-[#1D1D1F] truncate">{shift.staffName}</p>
                        <p className="text-[10px] text-[#86868B]">{shift.staffEmploymentType === 'employee' ? '社員' : 'バイト'}</p>
                      </div>
                      <div className="flex-1 relative h-9 bg-[#F5F5F7] rounded-md">
                        <ResizableShiftBar
                          shift={shift}
                          isEmployee={shift.staffEmploymentType === 'employee'}
                          isEditing={editingShift?.id === shift.id}
                          onStartEdit={() => { setEditingShift(shift); setShowAddForm(false); }}
                          onUpdate={handleShiftUpdate}

                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#D2D2D7] text-center py-6">この日はシフトが登録されていません</p>
              )}
              <p className="text-[10px] text-[#86868B] mt-2">※ バーの端をドラッグで時間調整 / 中央タップで削除</p>
            </div>
          </PageSection>

          {/* 選択中シフトの削除 */}
          {editingShift && (
            <div className="mt-3 flex items-center justify-between bg-[#FF9500]/5 border border-[#FF9500]/20 rounded-xl p-3">
              <span className="text-sm text-[#1D1D1F]"><strong>{editingShift.staffName}</strong> {editingShift.startTime.slice(0, 5)}-{editingShift.endTime.slice(0, 5)}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleDeleteShift(editingShift.id)}
                  className="rounded-lg border-[#FF3B30] text-[#FF3B30] hover:bg-[#FF3B30]/5">
                  <Trash2 className="w-3.5 h-3.5 mr-1" />削除
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingShift(null)} className="rounded-lg"><X className="w-4 h-4" /></Button>
              </div>
            </div>
          )}

          {/* 社員追加 */}
          <div className="mt-4">
            {!showAddForm ? (
              <Button onClick={() => { setShowAddForm(true); setEditingShift(null); }}
                className="w-full bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl h-12">
                <UserPlus className="w-5 h-5 mr-2" />自分のシフトを追加
              </Button>
            ) : (
              <PageSection>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#1D1D1F] flex items-center gap-1.5"><Pencil className="w-4 h-4 text-[#007AFF]" />シフトを追加（{user.name}）</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} className="h-8 w-8 p-0"><X className="w-4 h-4" /></Button>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1">
                    <label className="text-xs text-[#86868B] mb-1 block">開始</label>
                    <Select value={addStartTime} onValueChange={setAddStartTime}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIME_OPTIONS.filter(t => t !== '24:00').map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="pt-4 text-[#86868B]">〜</div>
                  <div className="flex-1">
                    <label className="text-xs text-[#86868B] mb-1 block">終了</label>
                    <Select value={addEndTime} onValueChange={setAddEndTime}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIME_OPTIONS.filter(t => t !== '00:00').map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
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
                  <Button onClick={handleAddShift} disabled={saving} className="flex-1 bg-[#34C759] hover:bg-[#2DB84E] text-white rounded-xl">{saving ? '登録中...' : '登録する'}</Button>
                  <Button variant="outline" onClick={() => setShowAddForm(false)} className="rounded-xl">キャンセル</Button>
                </div>
              </PageSection>
            )}
          </div>

          <div className="mt-4 mb-8">
            <Button onClick={() => navigateDay(1)} className="w-full rounded-xl h-14 text-lg bg-[#007AFF] hover:bg-[#0056CC] text-white">
              次の日へ <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        </>
      )}
        </>
      )}
    </DashboardLayout>
  );
}
