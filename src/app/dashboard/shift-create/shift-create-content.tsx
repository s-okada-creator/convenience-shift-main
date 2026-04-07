'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Wand2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  UserPlus,
  Sparkles,
  Info,
  MessageCircle,
  Clock,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { parseLineChat, type ParseResult, type ParsedStaff } from '@/lib/line-parser';
import {
  autoAssign,
  dbRequirementsToSlots,
  type AssignResult,
  type GapInfo,
  type TimeSlotDef,
  type DbRequirement,
  DEFAULT_TIME_SLOTS,
} from '@/lib/line-parser/assigner';

type Step = 'input' | 'parsed' | 'assigned' | 'complete';

const STEPS: { id: Step; label: string }[] = [
  { id: 'input', label: '1. 貼り付け' },
  { id: 'parsed', label: '2. 解析結果' },
  { id: 'assigned', label: '3. シフト確認・社員配置' },
  { id: 'complete', label: '4. 完成' },
];

const STEP_ORDER: Step[] = STEPS.map(s => s.id);
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function getDayOfWeek(year: number, month: number, day: number): string {
  return DAY_NAMES[new Date(year, month - 1, day).getDay()];
}

function getDow(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

interface Store { id: number; name: string; }

export function ShiftCreateContent({ user }: { user: SessionUser }) {
  const [step, setStep] = useState<Step>('input');

  // 店舗・DB必要人数
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [dbRequirements, setDbRequirements] = useState<DbRequirement[]>([]);
  const [requirementsLoaded, setRequirementsLoaded] = useState(false);

  // STEP 1
  const [lineText, setLineText] = useState('');
  const [targetMonth, setTargetMonth] = useState(String(new Date().getMonth() + 1));
  const [targetHalf, setTargetHalf] = useState<'first' | 'second'>('first');
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear()));

  // STEP 2
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // STEP 3
  const [assignResult, setAssignResult] = useState<AssignResult | null>(null);
  const [manualShifts, setManualShifts] = useState<{ day: number; slotId: string; slotLabel: string; startTime: string; endTime: string; name: string }[]>([]);
  const [managerName, setManagerName] = useState(user.name);
  // 日ごとの「自分を入れる」ドロップダウン開閉
  const [openAddDay, setOpenAddDay] = useState<number | null>(null);

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
    (async () => {
      try {
        const res = await fetch(`/api/shift-requirements?storeId=${selectedStoreId}`);
        if (res.ok) {
          const data = await res.json();
          setDbRequirements(data.map((r: { dayOfWeek: number; timeSlot: string; requiredCount: number }) => ({
            dayOfWeek: r.dayOfWeek, timeSlot: r.timeSlot, requiredCount: r.requiredCount,
          })));
        }
      } catch { /* ignore */ }
      finally { setRequirementsLoaded(true); }
    })();
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

  const resetAll = useCallback(() => {
    setStep('input');
    setLineText('');
    setParseResult(null);
    setAssignResult(null);
    setManualShifts([]);
    setOpenAddDay(null);
  }, []);

  // --- STEP 1 ---
  const handleParse = useCallback(() => {
    if (!lineText.trim()) return;
    const result = parseLineChat(lineText, parseInt(targetMonth), targetHalf, parseInt(targetYear));
    setParseResult(result);
    setAssignResult(null);
    setManualShifts([]);
    setStep('parsed');
  }, [lineText, targetMonth, targetHalf, targetYear]);

  // --- STEP 2 → 3 ---
  const handleAutoAssign = useCallback(() => {
    if (!parseResult) return;
    const result = autoAssign(parseResult, slotsByDow || undefined);
    setAssignResult(result);
    setManualShifts([]);
    setOpenAddDay(null);
    setStep('assigned');
  }, [parseResult, slotsByDow]);

  // --- STEP 3: 社員追加 ---
  const handleAddManager = useCallback((day: number, gap: GapInfo) => {
    if (!managerName.trim()) return;
    setManualShifts(prev => [...prev, {
      day,
      slotId: gap.slotId,
      slotLabel: gap.slotLabel,
      startTime: gap.startTime,
      endTime: gap.endTime,
      name: managerName,
    }]);
    setOpenAddDay(null);
  }, [managerName]);

  // --- 集計 ---
  const finalStats = useMemo(() => {
    if (!assignResult) return null;
    const manualCount = manualShifts.length;
    const totalFilled = assignResult.stats.filledSlots + manualCount;
    const totalSlots = assignResult.stats.totalSlots;
    const filledGapKeys = new Set(manualShifts.map(s => `${s.day}-${s.slotId}`));
    const remainingGaps = assignResult.gaps.filter(g => !filledGapKeys.has(`${g.day}-${g.slotId}`)).length;
    return { autoFilled: assignResult.stats.filledSlots, manualFilled: manualCount, totalFilled, totalSlots,
      coveragePercent: totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0, remainingGaps };
  }, [assignResult, manualShifts]);

  const shiftTableDays = useMemo(() => {
    if (!assignResult || !parseResult) return [];
    const { period } = parseResult;
    const startDay = period.half === 'first' ? 1 : 16;
    const daysInMonth = new Date(period.year, period.month, 0).getDate();
    const endDay = period.half === 'first' ? 15 : daysInMonth;
    const days: number[] = [];
    for (let d = startDay; d <= endDay; d++) days.push(d);
    return days;
  }, [assignResult, parseResult]);

  // --- レンダリング ---
  return (
    <DashboardLayout
      user={user}
      title={<span className="flex items-center gap-2"><Sparkles className="w-7 h-7 text-[#007AFF]" />LINE → シフト自動作成</span>}
      description="LINEトーク履歴を貼り付けて、シフトを自動生成"
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
                ? `必要人数設定を読み込みました（${stores.find(s => String(s.id) === selectedStoreId)?.name || '店舗'}）`
                : '必要人数が未設定です。デフォルト値で配置します'}
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
            <p className="text-sm text-[#86868B]">{lineText.length > 0 ? `${lineText.length.toLocaleString()}文字` : 'テキストを貼り付けてください'}</p>
            <Button onClick={handleParse} disabled={!lineText.trim()} className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl px-6">
              <Wand2 className="w-4 h-4 mr-2" />解析する
            </Button>
          </div>
        </PageSection>
      )}

      {/* ===== STEP 2 ===== */}
      {step === 'parsed' && parseResult && (
        <PageSection>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1D1D1F]">
              解析結果: {parseResult.period.year}年{parseResult.period.month}月{parseResult.period.half === 'first' ? '前半' : '後半'}
            </h2>
            <Badge className="bg-[#34C759] text-white">{parseResult.staff.length}名分を検出</Badge>
          </div>
          {parseResult.warnings.length > 0 && (
            <div className="bg-[#FF9500]/10 border border-[#FF9500]/30 rounded-xl p-3 mb-4">
              {parseResult.warnings.map((w, i) => (
                <p key={i} className="text-sm text-[#FF9500] flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />{w}</p>
              ))}
            </div>
          )}
          {parseResult.staff.length === 0 && (
            <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-xl p-4 mb-4 text-center">
              <p className="text-sm text-[#FF3B30]">シフト希望が見つかりませんでした。</p>
            </div>
          )}
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {parseResult.staff.map(s => <StaffParseCard key={s.name} staff={s} period={parseResult.period} />)}
          </div>
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#E5E5EA]">
            <Button variant="outline" onClick={() => setStep('input')} className="rounded-xl">
              <ChevronLeft className="w-4 h-4 mr-1" />戻る
            </Button>
            <Button onClick={handleAutoAssign} disabled={parseResult.staff.length === 0} className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl px-6">
              <Sparkles className="w-4 h-4 mr-2" />シフトを自動配置
            </Button>
          </div>
        </PageSection>
      )}

      {/* ===== STEP 3: 日別カード形式 ===== */}
      {(step === 'assigned' || step === 'complete') && assignResult && parseResult && (
        <>
          {/* サマリー */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatBadge label="バイト配置" value={`${assignResult.stats.filledSlots}枠`} color="blue" />
            <StatBadge label="社員配置" value={`${manualShifts.length}枠`} color="green" />
            <StatBadge
              label="カバー率"
              value={`${finalStats?.coveragePercent ?? assignResult.stats.coveragePercent}%`}
              color={(finalStats?.coveragePercent ?? assignResult.stats.coveragePercent) >= 70 ? 'green' : (finalStats?.coveragePercent ?? assignResult.stats.coveragePercent) >= 40 ? 'yellow' : 'red'}
            />
          </div>

          {/* 社員名（固定入力） */}
          {step === 'assigned' && (
            <div className="bg-white rounded-xl border border-[#E5E5EA] p-3 mb-4 flex items-center gap-3">
              <label className="text-sm text-[#86868B] flex-shrink-0">社員名:</label>
              <input type="text" value={managerName} onChange={e => setManagerName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-[#E5E5EA] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]" />
            </div>
          )}

          {/* 日別カード */}
          <div className="space-y-3">
            {shiftTableDays.map(day => {
              const { year, month } = parseResult.period;
              const dow = getDayOfWeek(year, month, day);
              const dowNum = getDow(year, month, day);
              const isWeekend = dowNum === 0 || dowNum === 6;

              const dayShifts = assignResult.shifts.filter(s => s.day === day);
              const dayManual = manualShifts.filter(s => s.day === day);
              const dayGaps = assignResult.gaps.filter(g => g.day === day);
              const filledGapKeys = new Set(dayManual.map(s => s.slotId));
              const remainingGaps = dayGaps.filter(g => !filledGapKeys.has(g.slotId));
              const isAddOpen = openAddDay === day;

              return (
                <div key={day} className={`rounded-2xl border overflow-hidden ${
                  isWeekend ? 'border-[#007AFF]/20 bg-[#007AFF]/[0.02]' : 'border-[#E5E5EA] bg-white'
                }`}>
                  {/* 日付ヘッダー */}
                  <div className={`px-4 py-2.5 flex items-center justify-between ${
                    isWeekend ? 'bg-[#007AFF]/5' : 'bg-[#F5F5F7]'
                  }`}>
                    <span className={`text-sm font-bold ${
                      dowNum === 0 ? 'text-[#FF3B30]' : dowNum === 6 ? 'text-[#007AFF]' : 'text-[#1D1D1F]'
                    }`}>
                      {month}/{day}（{dow}）
                    </span>
                    <div className="flex items-center gap-2">
                      {dayShifts.length > 0 && (
                        <Badge variant="outline" className="text-[10px] border-[#34C759]/30 text-[#34C759]">
                          {dayShifts.length}名配置
                        </Badge>
                      )}
                      {remainingGaps.length > 0 && (
                        <Badge variant="outline" className="text-[10px] border-[#FF9500]/30 text-[#FF9500]">
                          {remainingGaps.length}枠空き
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    {/* 配置済みスタッフ */}
                    {(dayShifts.length > 0 || dayManual.length > 0) && (
                      <div className="space-y-1.5 mb-3">
                        {dayShifts.map((s, i) => (
                          <div key={`a-${i}`} className="flex items-center gap-2 text-sm">
                            <Clock className="w-3.5 h-3.5 text-[#86868B]" />
                            <span className="text-[#86868B] text-xs w-24">{s.startTime}-{s.endTime}</span>
                            <span className="text-[#1D1D1F] font-medium">{s.staffName}</span>
                          </div>
                        ))}
                        {dayManual.map((s, i) => (
                          <div key={`m-${i}`} className="flex items-center gap-2 text-sm">
                            <Clock className="w-3.5 h-3.5 text-[#007AFF]" />
                            <span className="text-[#007AFF] text-xs w-24">{s.startTime}-{s.endTime}</span>
                            <span className="text-[#007AFF] font-medium">{s.name}（社員）</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 不足メッセージ */}
                    {remainingGaps.length > 0 && (
                      <div className="space-y-1.5">
                        {remainingGaps.map((gap, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-[#FF9500]">
                            <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{gap.slotLabel}（{gap.startTime}-{gap.endTime}）あと{gap.shortage}人ほしい</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 配置なし＆不足なし */}
                    {dayShifts.length === 0 && dayManual.length === 0 && remainingGaps.length === 0 && (
                      <p className="text-sm text-[#D2D2D7]">配置なし</p>
                    )}

                    {/* 社員追加ボタン */}
                    {step === 'assigned' && remainingGaps.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#E5E5EA]/50">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOpenAddDay(isAddOpen ? null : day)}
                          className="rounded-lg text-xs border-[#007AFF]/30 text-[#007AFF] hover:bg-[#007AFF]/5 w-full justify-between"
                        >
                          <span className="flex items-center gap-1.5">
                            <UserPlus className="w-3.5 h-3.5" />社員を入れる
                          </span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isAddOpen ? 'rotate-180' : ''}`} />
                        </Button>

                        {isAddOpen && (
                          <div className="mt-2 space-y-2">
                            {remainingGaps.map((gap, i) => (
                              <button
                                key={i}
                                onClick={() => handleAddManager(day, gap)}
                                className="w-full text-left px-3 py-2.5 rounded-lg bg-[#007AFF]/5 hover:bg-[#007AFF]/10 transition-colors border border-[#007AFF]/10"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-sm font-medium text-[#007AFF]">{gap.slotLabel}</span>
                                    <span className="text-xs text-[#86868B] ml-2">{gap.startTime}-{gap.endTime}</span>
                                  </div>
                                  <Badge className="bg-[#007AFF] text-white text-[10px]">
                                    {managerName}を入れる
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ボトム操作 */}
          <div className="flex items-center justify-between mt-6">
            <Button variant="outline" onClick={() => setStep('parsed')} className="rounded-xl">
              <ChevronLeft className="w-4 h-4 mr-1" />戻る
            </Button>
            {step === 'assigned' && (
              <Button onClick={() => setStep('complete')} className="bg-[#34C759] hover:bg-[#2DB84E] text-white rounded-xl px-6">
                <CheckCircle2 className="w-4 h-4 mr-2" />完了
              </Button>
            )}
          </div>
        </>
      )}

      {/* ===== STEP 4: 完成 ===== */}
      {step === 'complete' && finalStats && (
        <PageSection className="mt-4">
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-[#34C759] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#1D1D1F] mb-2">シフト作成完了</h2>
            <p className="text-[#86868B] mb-6">
              カバー率: {finalStats.coveragePercent}%（バイト{finalStats.autoFilled}枠 + 社員{finalStats.manualFilled}枠）
            </p>
            {finalStats.remainingGaps > 0 && (
              <div className="bg-[#FF9500]/10 border border-[#FF9500]/30 rounded-xl p-4 mb-6 max-w-md mx-auto">
                <p className="text-sm text-[#FF9500]">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />残り{finalStats.remainingGaps}枠が未配置です
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setStep('assigned')} className="rounded-xl">シフト表を確認</Button>
              <Button onClick={resetAll} className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl">新しいシフトを作成</Button>
            </div>
          </div>
        </PageSection>
      )}
    </DashboardLayout>
  );
}

// ========== サブコンポーネント ==========

function StaffParseCard({ staff, period }: { staff: ParsedStaff; period: ParseResult['period'] }) {
  const availableDays = staff.entries.filter(e => e.available).length;
  const totalDays = staff.entries.length;
  return (
    <div className="border border-[#E5E5EA] rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#007AFF] to-[#5856D6] rounded-full flex items-center justify-center text-white text-xs font-medium">
            {staff.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-[#1D1D1F]">{staff.name}</p>
            {staff.lineName !== staff.name && <p className="text-[10px] text-[#86868B]">LINE: {staff.lineName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {staff.constraints && <Badge variant="outline" className="text-[10px] border-[#FF9500]/30 text-[#FF9500]">{staff.constraints[0]}</Badge>}
          <Badge variant="outline" className={`text-xs ${availableDays > 0 ? 'border-[#34C759]/30 text-[#34C759]' : 'border-[#FF3B30]/30 text-[#FF3B30]'}`}>
            {availableDays}/{totalDays}日可
          </Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {staff.entries.map(entry => {
          const dow = getDayOfWeek(period.year, period.month, entry.day);
          return (
            <div key={entry.day} className={`text-[10px] px-1.5 py-0.5 rounded ${
              !entry.available ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 'bg-[#34C759]/10 text-[#34C759]'
            }`} title={entry.startTime ? `${entry.startTime}-${entry.endTime}` : entry.available ? '可' : '不可'}>
              {entry.day}({dow}){entry.available && entry.startTime && <span className="ml-0.5">{entry.startTime.slice(0, 5)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string; color: 'blue' | 'green' | 'red' | 'yellow' }) {
  const colors = {
    blue: 'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20',
    green: 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20',
    red: 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20',
    yellow: 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20',
  };
  return (
    <div className={`rounded-xl border p-3 text-center ${colors[color]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs opacity-80">{label}</p>
    </div>
  );
}
