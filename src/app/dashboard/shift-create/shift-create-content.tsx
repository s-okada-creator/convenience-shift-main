'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Wand2, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft,
  Sparkles, Info, Calendar, Loader2,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { parseLineChat, type ParseResult } from '@/lib/line-parser';
import {
  autoAssign, dbRequirementsToSlots,
  type AssignResult, type TimeSlotDef, type DbRequirement, DEFAULT_TIME_SLOTS,
} from '@/lib/line-parser/assigner';

type Step = 'input' | 'parsed' | 'saving' | 'complete';

const STEPS: { id: Step; label: string }[] = [
  { id: 'input', label: '1. 貼り付け' },
  { id: 'parsed', label: '2. 確認' },
  { id: 'saving', label: '3. 登録中' },
  { id: 'complete', label: '4. 完了' },
];

const STEP_ORDER: Step[] = STEPS.map(s => s.id);
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function getDayOfWeek(year: number, month: number, day: number): string {
  return DAY_NAMES[new Date(year, month - 1, day).getDay()];
}

interface Store { id: number; name: string; }
interface DbStaff { id: number; name: string; employmentType: string; }

export function ShiftCreateContent({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('input');

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [dbRequirements, setDbRequirements] = useState<DbRequirement[]>([]);
  const [dbStaff, setDbStaff] = useState<DbStaff[]>([]);
  const [requirementsLoaded, setRequirementsLoaded] = useState(false);

  const [lineText, setLineText] = useState('');
  const [targetMonth, setTargetMonth] = useState(String(new Date().getMonth() + 1));
  const [targetHalf, setTargetHalf] = useState<'first' | 'second'>('first');
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear()));

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [assignResult, setAssignResult] = useState<AssignResult | null>(null);
  // 登録後のスタッフマップ（名前→staffId）
  const [registeredStaffMap, setRegisteredStaffMap] = useState<Map<string, number>>(new Map());

  const [saveProgress, setSaveProgress] = useState({ total: 0, done: 0, errors: 0, phase: '' });
  const [savedCount, setSavedCount] = useState(0);

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

  useEffect(() => {
    if (!selectedStoreId) return;
    Promise.all([
      fetch(`/api/shift-requirements?storeId=${selectedStoreId}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/staff?storeId=${selectedStoreId}`).then(r => r.ok ? r.json() : []),
    ]).then(([reqs, staffList]) => {
      setDbRequirements(reqs.map((r: { dayOfWeek: number; timeSlot: string; requiredCount: number }) => ({
        dayOfWeek: r.dayOfWeek, timeSlot: r.timeSlot, requiredCount: r.requiredCount,
      })));
      setDbStaff(staffList);
      setRequirementsLoaded(true);
    }).catch(() => setRequirementsLoaded(true));
  }, [selectedStoreId]);

  const slotsByDow = useMemo((): Map<number, TimeSlotDef[]> | null => {
    if (dbRequirements.length === 0) return null;
    const map = new Map<number, TimeSlotDef[]>();
    for (let dow = 0; dow <= 6; dow++) {
      const slots = dbRequirementsToSlots(dbRequirements, dow);
      if (slots.length > 0) map.set(dow, slots);
    }
    return map.size > 0 ? map : null;
  }, [dbRequirements]);

  // 希望を出した人（available=trueが1日以上ある人）
  const activeStaff = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.staff.filter(s => s.entries.some(e => e.available));
  }, [parseResult]);

  const resetAll = useCallback(() => {
    setStep('input');
    setLineText('');
    setParseResult(null);
    setAssignResult(null);
    setRegisteredStaffMap(new Map());
    setSaveProgress({ total: 0, done: 0, errors: 0, phase: '' });
    setSavedCount(0);
  }, []);

  // --- STEP 1: 解析 + 自動配置 ---
  const handleParseAndAssign = useCallback(() => {
    if (!lineText.trim()) return;
    const parsed = parseLineChat(lineText, parseInt(targetMonth), targetHalf, parseInt(targetYear));
    setParseResult(parsed);
    if (parsed.staff.length > 0) {
      setAssignResult(autoAssign(parsed, slotsByDow || undefined));
    }
    setStep('parsed');
  }, [lineText, targetMonth, targetHalf, targetYear, slotsByDow]);

  // --- STEP 2→3: 未登録スタッフ自動登録 → シフト一括登録 ---
  const handleSaveShifts = useCallback(async () => {
    if (!assignResult || !parseResult) return;
    const storeId = parseInt(selectedStoreId);
    const { year, month } = parseResult.period;

    setStep('saving');

    // === PHASE 1: スタッフ登録（最新のDB一覧を再取得して重複防止） ===
    setSaveProgress({ total: 0, done: 0, errors: 0, phase: 'スタッフを確認中...' });

    // 最新のスタッフ一覧をDB再取得（2回目実行時の重複防止）
    let latestStaff: DbStaff[] = dbStaff;
    try {
      const res = await fetch(`/api/staff?storeId=${storeId}`);
      if (res.ok) latestStaff = await res.json();
    } catch { /* fallback to cached */ }

    const staffMap = new Map<string, number>();

    // 既存スタッフとマッチング
    for (const parsed of activeStaff) {
      const normalizedName = parsed.name.replace(/\s+/g, '');
      const exact = latestStaff.find(s => s.name.replace(/\s+/g, '') === normalizedName);
      if (exact) { staffMap.set(parsed.name, exact.id); continue; }
      const partial = latestStaff.find(s =>
        s.name.replace(/\s+/g, '').includes(normalizedName) ||
        normalizedName.includes(s.name.replace(/\s+/g, ''))
      );
      if (partial) { staffMap.set(parsed.name, partial.id); }
    }

    // 未登録のみ新規登録
    const unmatched = activeStaff.filter(s => !staffMap.has(s.name));
    for (const staff of unmatched) {
      try {
        const res = await fetch('/api/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId, name: staff.name, employmentType: 'part_time',
            hourlyRate: 1000, joinedAt: new Date().toISOString().slice(0, 10),
            skillLevel: 1, role: 'staff',
          }),
        });
        if (res.ok) {
          const newStaff = await res.json();
          staffMap.set(staff.name, newStaff.id);
        }
      } catch { /* continue */ }
    }

    setRegisteredStaffMap(staffMap);

    // === PHASE 2: 既存シフト取得（重複チェック用） ===
    setSaveProgress({ total: 0, done: 0, errors: 0, phase: '既存シフトを確認中...' });

    const startDay = parseResult.period.half === 'first' ? '01' : '16';
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDay = parseResult.period.half === 'first' ? '15' : String(daysInMonth);
    const periodStartDate = `${year}-${String(month).padStart(2, '0')}-${startDay}`;
    const periodEndDate = `${year}-${String(month).padStart(2, '0')}-${endDay}`;

    let existingShifts: { staffId: number; date: string; startTime: string; endTime: string }[] = [];
    try {
      const res = await fetch(`/api/shifts?storeId=${storeId}&startDate=${periodStartDate}&endDate=${periodEndDate}`);
      if (res.ok) {
        const data = await res.json();
        existingShifts = data.map((s: { staffId: number; date: string; startTime: string; endTime: string }) => ({
          staffId: s.staffId, date: s.date, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5),
        }));
      }
    } catch { /* continue */ }

    // === PHASE 3: シフト登録（重複スキップ） ===
    const shiftsToSave: { staffId: number; date: string; startTime: string; endTime: string }[] = [];
    for (const shift of assignResult.shifts) {
      const staffId = staffMap.get(shift.staffName);
      if (!staffId) continue;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(shift.day).padStart(2, '0')}`;

      // 重複チェック: 同じスタッフ・同じ日・同じ時間のシフトが既にあればスキップ
      const isDuplicate = existingShifts.some(e =>
        e.staffId === staffId && e.date === dateStr &&
        e.startTime === shift.startTime && e.endTime === shift.endTime
      );
      if (isDuplicate) continue;

      shiftsToSave.push({ staffId, date: dateStr, startTime: shift.startTime, endTime: shift.endTime });
    }

    setSaveProgress({ total: shiftsToSave.length, done: 0, errors: 0, phase: 'シフトを登録中...' });

    let done = 0;
    let errors = 0;
    for (const shift of shiftsToSave) {
      try {
        const res = await fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...shift, storeId }),
        });
        if (res.ok) done++; else errors++;
      } catch { errors++; }
      setSaveProgress({ total: shiftsToSave.length, done: done + errors, errors, phase: 'シフトを登録中...' });
    }

    setSavedCount(done);
    setStep('complete');
  }, [assignResult, parseResult, selectedStoreId, activeStaff, dbStaff]);

  return (
    <DashboardLayout
      user={user}
      title={<span className="flex items-center gap-2"><Sparkles className="w-7 h-7 text-[#007AFF]" />LINE → シフト自動作成</span>}
      description="LINEトーク履歴からシフトを自動登録"
      actions={stores.length > 1 ? (
        <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
          <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white"><SelectValue placeholder="店舗を選択" /></SelectTrigger>
          <SelectContent>{stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : undefined}
    >
      {/* ステップ */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isPast = STEP_ORDER.indexOf(step) > i;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-shrink-0">
              {i > 0 && <ChevronRight className="w-4 h-4 text-[#D2D2D7]" />}
              <Badge variant={isActive ? 'default' : 'outline'} className={`text-xs whitespace-nowrap ${
                isActive ? 'bg-[#007AFF] text-white' : isPast ? 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/30' : 'text-[#86868B] border-[#E5E5EA]'
              }`}>
                {isPast && !isActive ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}{s.label}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* ===== STEP 1 ===== */}
      {step === 'input' && (
        <PageSection>
          <h2 className="text-lg font-bold text-[#1D1D1F] mb-4">LINEトーク履歴を貼り付けてください</h2>

          {requirementsLoaded && (
            <div className={`rounded-xl p-3 mb-4 flex items-center gap-2 text-sm ${
              dbRequirements.length > 0 ? 'bg-[#34C759]/10 border border-[#34C759]/20 text-[#34C759]' : 'bg-[#FF9500]/10 border border-[#FF9500]/20 text-[#FF9500]'
            }`}>
              <Info className="w-4 h-4 flex-shrink-0" />
              {dbRequirements.length > 0
                ? `${stores.find(s => String(s.id) === selectedStoreId)?.name || '店舗'}: 必要人数設定OK`
                : '必要人数が未設定です。先に「必要人数設定」で設定してください'}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={targetYear} onValueChange={setTargetYear}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}年</SelectItem>)}</SelectContent>
            </Select>
            <Select value={targetMonth} onValueChange={setTargetMonth}>
              <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}月</SelectItem>)}</SelectContent>
            </Select>
            <Select value={targetHalf} onValueChange={v => setTargetHalf(v as 'first' | 'second')}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="first">前半</SelectItem>
                <SelectItem value="second">後半</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <textarea value={lineText} onChange={e => setLineText(e.target.value)}
            placeholder={'LINEのトーク履歴をここに貼り付けてください...\n\n例:\n【名前】温水直也\n1（水）×\n2（木）9-17\n...'}
            className="w-full h-64 sm:h-80 p-4 border border-[#E5E5EA] rounded-xl resize-y font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent" />

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-[#86868B]">{lineText.length > 0 ? `${lineText.length.toLocaleString()}文字` : ''}</p>
            <Button onClick={handleParseAndAssign} disabled={!lineText.trim()} className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl px-6">
              <Wand2 className="w-4 h-4 mr-2" />解析してシフト作成
            </Button>
          </div>
        </PageSection>
      )}

      {/* ===== STEP 2 ===== */}
      {step === 'parsed' && parseResult && (
        <>
          <PageSection>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1D1D1F]">
                {parseResult.period.month}月{parseResult.period.half === 'first' ? '前半' : '後半'}のシフト
              </h2>
              {assignResult && (
                <Badge className="bg-[#007AFF] text-white text-sm">
                  {assignResult.shifts.length}件のシフトを作成
                </Badge>
              )}
            </div>

            {parseResult.warnings.length > 0 && (
              <div className="bg-[#FF9500]/10 border border-[#FF9500]/30 rounded-xl p-3 mb-4">
                {parseResult.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-[#FF9500] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />{w}
                  </p>
                ))}
              </div>
            )}

            {/* 希望を出した人の一覧 */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#1D1D1F] mb-2">
                シフト希望提出者（{activeStaff.length}名）
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeStaff.map(s => {
                  const availDays = s.entries.filter(e => e.available).length;
                  return (
                    <div key={s.name} className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#34C759]/20 bg-[#34C759]/5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#34C759]" />
                        <span className="text-sm font-medium text-[#1D1D1F]">{s.name}</span>
                      </div>
                      <span className="text-xs text-[#86868B]">{availDays}日出勤可</span>
                    </div>
                  );
                })}
              </div>
              {activeStaff.length === 0 && (
                <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-xl p-4 text-center">
                  <p className="text-sm text-[#FF3B30]">出勤可能なスタッフが見つかりませんでした。</p>
                </div>
              )}
            </div>

            {/* シフトプレビュー */}
            {assignResult && assignResult.shifts.length > 0 && (
              <div className="border border-[#E5E5EA] rounded-xl p-4">
                <h3 className="text-sm font-semibold text-[#1D1D1F] mb-3">登録されるシフト（プレビュー）</h3>
                <div className="max-h-[400px] overflow-y-auto space-y-4">
                  {(() => {
                    const { year, month } = parseResult.period;
                    const startDay = parseResult.period.half === 'first' ? 1 : 16;
                    const daysInMonth = new Date(year, month, 0).getDate();
                    const endDay = parseResult.period.half === 'first' ? 15 : daysInMonth;
                    const days: number[] = [];
                    for (let d = startDay; d <= endDay; d++) days.push(d);

                    return days.map(day => {
                      const dayShifts = assignResult.shifts.filter(s => s.day === day);
                      if (dayShifts.length === 0) return null;
                      const dow = getDayOfWeek(year, month, day);
                      const dowNum = new Date(year, month - 1, day).getDay();
                      return (
                        <div key={day}>
                          <p className={`text-sm font-semibold mb-1 ${
                            dowNum === 0 ? 'text-[#FF3B30]' : dowNum === 6 ? 'text-[#007AFF]' : 'text-[#1D1D1F]'
                          }`}>{month}/{day}（{dow}）</p>
                          <div className="space-y-1 pl-3">
                            {dayShifts.map((s, i) => (
                              <p key={i} className="text-sm text-[#86868B]">
                                <span className="text-[#1D1D1F] font-medium">{s.staffName}</span> {s.startTime}-{s.endTime}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </PageSection>

          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" onClick={() => setStep('input')} className="rounded-xl">
              <ChevronLeft className="w-4 h-4 mr-1" />戻る
            </Button>
            <Button
              onClick={handleSaveShifts}
              disabled={!assignResult || assignResult.shifts.length === 0}
              className="bg-[#34C759] hover:bg-[#2DB84E] text-white rounded-xl px-6"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              シフトを登録する（{assignResult?.shifts.length || 0}件）
            </Button>
          </div>
        </>
      )}

      {/* ===== STEP 3 ===== */}
      {step === 'saving' && (
        <PageSection>
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 text-[#007AFF] mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-bold text-[#1D1D1F] mb-2">{saveProgress.phase}</h2>
            {saveProgress.total > 0 && (
              <>
                <p className="text-[#86868B] mb-4">{saveProgress.done} / {saveProgress.total} 件</p>
                <div className="w-64 mx-auto bg-[#E5E5EA] rounded-full h-2">
                  <div className="bg-[#007AFF] rounded-full h-2 transition-all duration-300"
                    style={{ width: `${(saveProgress.done / saveProgress.total) * 100}%` }} />
                </div>
              </>
            )}
          </div>
        </PageSection>
      )}

      {/* ===== STEP 4 ===== */}
      {step === 'complete' && (
        <PageSection>
          <div className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 text-[#34C759] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#1D1D1F] mb-2">シフト登録完了</h2>
            <p className="text-[#86868B] mb-2">{savedCount}件のシフトを登録しました</p>
            {saveProgress.errors > 0 && (
              <p className="text-sm text-[#FF9500] mb-4">{saveProgress.errors}件がエラーで登録できませんでした</p>
            )}
            <p className="text-sm text-[#86868B] mb-8">
              次は「シフト微調整」で社員のシフトを追加してください
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => {
                  const startDay = parseResult?.period.half === 'first' ? '01' : '16';
                  const m = String(parseResult?.period.month || 1).padStart(2, '0');
                  const y = parseResult?.period.year || new Date().getFullYear();
                  router.push(`/dashboard/shift-adjust?date=${y}-${m}-${startDay}`);
                }}
                className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl px-6"
              >
                <Calendar className="w-4 h-4 mr-2" />シフト微調整を開く
              </Button>
              <Button variant="outline" onClick={resetAll} className="rounded-xl">続けて作成</Button>
            </div>
          </div>
        </PageSection>
      )}
    </DashboardLayout>
  );
}
