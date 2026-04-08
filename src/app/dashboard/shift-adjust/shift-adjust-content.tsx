'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Clock,
  Pencil,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { timeToMinutes } from '@/lib/time-constants';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// 時間軸のヘッダー（3時間刻み表示用）
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];
const TOTAL_MINUTES = 24 * 60;

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
  // 日付管理
  const [currentDate, setCurrentDate] = useState(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return params.get('date') || new Date().toISOString().slice(0, 10);
  });
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // データ
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  // 社員追加
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStartTime, setAddStartTime] = useState('09:00');
  const [addEndTime, setAddEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);

  // 現在日の情報
  const dateObj = useMemo(() => new Date(currentDate + 'T00:00:00'), [currentDate]);
  const dayOfWeek = useMemo(() => dateObj.getDay(), [dateObj]);
  const dateLabel = useMemo(() => {
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    const dow = DAY_NAMES[dayOfWeek];
    return `${m}/${d}（${dow}）`;
  }, [dateObj, dayOfWeek]);

  // 期間の初期化（前半: 1-15、後半: 16-末日）
  useEffect(() => {
    const d = new Date(currentDate + 'T00:00:00');
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    if (day <= 15) {
      setPeriodStart(`${year}-${String(month + 1).padStart(2, '0')}-01`);
      setPeriodEnd(`${year}-${String(month + 1).padStart(2, '0')}-15`);
    } else {
      const lastDay = new Date(year, month + 1, 0).getDate();
      setPeriodStart(`${year}-${String(month + 1).padStart(2, '0')}-16`);
      setPeriodEnd(`${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`);
    }
  }, [currentDate]);

  // --- データ取得 ---
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

  // --- 不足分析 ---
  const gapMessages = useMemo(() => {
    if (requirements.length === 0) return [];

    // 30分スロットごとに配置人数 vs 必要人数をチェック
    const gaps: { startTime: string; endTime: string; shortage: number }[] = [];
    let currentGapStart: string | null = null;
    let currentShortage = 0;

    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const req = requirements.find(r => r.timeSlot === slot);
        const required = req ? req.requiredCount : 0;
        if (required === 0) {
          if (currentGapStart) {
            gaps.push({ startTime: currentGapStart, endTime: slot, shortage: currentShortage });
            currentGapStart = null;
          }
          continue;
        }

        const slotMin = h * 60 + m;
        const slotEnd = slotMin + 30;
        const assigned = shifts.filter(s => {
          const sStart = timeToMinutes(s.startTime.slice(0, 5));
          const sEnd = timeToMinutes(s.endTime.slice(0, 5));
          return sStart < slotEnd && sEnd > slotMin;
        }).length;

        const shortage = required - assigned;
        if (shortage > 0) {
          if (currentGapStart && currentShortage === shortage) {
            // 連続スロットで同じ不足数 → 結合
          } else {
            if (currentGapStart) {
              gaps.push({ startTime: currentGapStart, endTime: slot, shortage: currentShortage });
            }
            currentGapStart = slot;
            currentShortage = shortage;
          }
        } else {
          if (currentGapStart) {
            gaps.push({ startTime: currentGapStart, endTime: slot, shortage: currentShortage });
            currentGapStart = null;
          }
        }
      }
    }
    if (currentGapStart) {
      gaps.push({ startTime: currentGapStart, endTime: '24:00', shortage: currentShortage });
    }
    return gaps;
  }, [shifts, requirements]);

  // --- ナビゲーション ---
  const navigateDay = useCallback((direction: number) => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + direction);
    setCurrentDate(d.toISOString().slice(0, 10));
    setShowAddForm(false);
  }, [currentDate]);

  // --- 社員シフト追加 ---
  const handleAddShift = useCallback(async () => {
    if (!user.id || !selectedStoreId) return;
    setSaving(true);
    try {
      // ログインユーザーのstaffIdを取得（staffテーブルから）
      const staffRes = await fetch(`/api/staff?storeId=${selectedStoreId}`);
      const staffList = staffRes.ok ? await staffRes.json() : [];

      // ユーザー名で検索（デモ用の簡易マッチ）
      let staffId = staffList.find((s: { name: string; id: number }) => s.name === user.name)?.id;
      if (!staffId && staffList.length > 0) {
        // 社員で最初のを使う
        const employee = staffList.find((s: { employmentType: string }) => s.employmentType === 'employee');
        staffId = employee?.id || staffList[0].id;
      }

      if (!staffId) {
        alert('スタッフ情報が見つかりません');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId,
          storeId: parseInt(selectedStoreId),
          date: currentDate,
          startTime: addStartTime,
          endTime: addEndTime,
        }),
      });

      if (res.ok) {
        setShowAddForm(false);
        fetchDayData();
      } else {
        const error = await res.json();
        alert(error.error || '登録に失敗しました');
      }
    } catch { alert('登録に失敗しました'); }
    finally { setSaving(false); }
  }, [user, selectedStoreId, currentDate, addStartTime, addEndTime, fetchDayData]);

  // --- シフトが入っている人だけ ---
  const activeShifts = useMemo(() =>
    shifts.filter(s => s.staffName).sort((a, b) => timeToMinutes(a.startTime.slice(0, 5)) - timeToMinutes(b.startTime.slice(0, 5))),
    [shifts]
  );

  // --- 必要人数バー ---
  const requirementBar = useMemo(() => {
    const slots: { time: string; required: number; assigned: number }[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const req = requirements.find(r => r.timeSlot === slot);
        const required = req ? req.requiredCount : 0;
        const slotMin = h * 60 + m;
        const slotEnd = slotMin + 30;
        const assigned = shifts.filter(s => {
          const sStart = timeToMinutes(s.startTime.slice(0, 5));
          const sEnd = timeToMinutes(s.endTime.slice(0, 5));
          return sStart < slotEnd && sEnd > slotMin;
        }).length;
        slots.push({ time: slot, required, assigned });
      }
    }
    return slots;
  }, [shifts, requirements]);

  return (
    <DashboardLayout
      user={user}
      title="シフト微調整"
      description="1日ずつ確認して社員シフトを追加"
      actions={stores.length > 1 ? (
        <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
          <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white"><SelectValue placeholder="店舗を選択" /></SelectTrigger>
          <SelectContent>{stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : undefined}
    >
      {/* 日付ナビゲーション */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" onClick={() => navigateDay(-1)} className="rounded-xl">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-center">
          <h2 className={`text-2xl font-bold ${
            dayOfWeek === 0 ? 'text-[#FF3B30]' : dayOfWeek === 6 ? 'text-[#007AFF]' : 'text-[#1D1D1F]'
          }`}>
            {dateLabel}
          </h2>
          {periodStart && periodEnd && (
            <p className="text-xs text-[#86868B]">
              期間: {periodStart.slice(5).replace('-', '/')} 〜 {periodEnd.slice(5).replace('-', '/')}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigateDay(1)} className="rounded-xl">
          <ChevronRight className="w-5 h-5" />
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
                  <p key={i} className="text-sm text-[#FF3B30]">
                    {g.startTime}〜{g.endTime} あと{g.shortage}人
                  </p>
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
            {/* 必要人数ヘッダー */}
            <div className="min-w-[600px]">
              {/* 時間軸 */}
              <div className="flex items-end mb-1" style={{ marginLeft: '120px' }}>
                {HOUR_LABELS.map(h => (
                  <div key={h} className="text-[10px] text-[#86868B]" style={{ width: `${(3 * 60 / TOTAL_MINUTES) * 100}%` }}>
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>

              {/* 必要人数 vs 配置人数バー */}
              <div className="flex items-center mb-3">
                <div className="w-[120px] flex-shrink-0 pr-2">
                  <span className="text-[10px] text-[#86868B]">必要人数</span>
                </div>
                <div className="flex-1 flex h-5 rounded-md overflow-hidden bg-[#F5F5F7]">
                  {requirementBar.map((slot, i) => {
                    const isFull = slot.assigned >= slot.required;
                    const isEmpty = slot.required === 0;
                    return (
                      <div
                        key={i}
                        className={`h-full border-r border-white/30 flex items-center justify-center ${
                          isEmpty ? 'bg-[#F5F5F7]' :
                          isFull ? 'bg-[#34C759]/30' : 'bg-[#FF3B30]/20'
                        }`}
                        style={{ width: `${(1 / 48) * 100}%` }}
                        title={`${slot.time}: ${slot.assigned}/${slot.required}人`}
                      >
                        {i % 2 === 0 && slot.required > 0 && (
                          <span className={`text-[8px] font-bold ${isFull ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
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
                    const startMin = timeToMinutes(shift.startTime.slice(0, 5));
                    const endMin = timeToMinutes(shift.endTime.slice(0, 5));
                    const leftPercent = (startMin / TOTAL_MINUTES) * 100;
                    const widthPercent = ((endMin > startMin ? endMin - startMin : endMin + TOTAL_MINUTES - startMin) / TOTAL_MINUTES) * 100;
                    const isEmployee = shift.staffEmploymentType === 'employee';
                    const duration = endMin > startMin ? endMin - startMin : endMin + TOTAL_MINUTES - startMin;
                    const hours = Math.floor(duration / 60);
                    const mins = duration % 60;

                    return (
                      <div key={shift.id} className="flex items-center">
                        <div className="w-[120px] flex-shrink-0 pr-2">
                          <p className="text-sm font-medium text-[#1D1D1F] truncate">{shift.staffName}</p>
                          <p className="text-[10px] text-[#86868B]">{isEmployee ? '社員' : 'バイト'}</p>
                        </div>
                        <div className="flex-1 relative h-8 bg-[#F5F5F7] rounded-md">
                          <div
                            className={`absolute top-0.5 bottom-0.5 rounded-md flex items-center justify-center ${
                              isEmployee ? 'bg-[#34C759]' : 'bg-[#007AFF]'
                            }`}
                            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          >
                            <span className="text-[10px] text-white font-medium truncate px-1">
                              {shift.startTime.slice(0, 5)}-{shift.endTime.slice(0, 5)} ({hours}h{mins > 0 ? `${mins}m` : ''})
                            </span>
                          </div>
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
                        {Array.from({ length: 48 }, (_, i) => {
                          const h = Math.floor(i / 2);
                          const m = i % 2 === 0 ? '00' : '30';
                          const t = `${String(h).padStart(2, '0')}:${m}`;
                          return <SelectItem key={t} value={t}>{t}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-4 text-[#86868B]">〜</div>
                  <div className="flex-1">
                    <label className="text-xs text-[#86868B] mb-1 block">終了</label>
                    <Select value={addEndTime} onValueChange={setAddEndTime}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 48 }, (_, i) => {
                          const h = Math.floor((i + 1) / 2);
                          const m = (i + 1) % 2 === 0 ? '00' : '30';
                          const t = i === 47 ? '24:00' : `${String(h).padStart(2, '0')}:${m}`;
                          return <SelectItem key={t} value={t}>{t}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 不足時間帯のクイック選択 */}
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
          <div className="mt-4">
            <Button onClick={() => navigateDay(1)} variant="outline" className="w-full rounded-xl h-12 text-base border-[#007AFF] text-[#007AFF] hover:bg-[#007AFF]/5">
              次の日へ <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
