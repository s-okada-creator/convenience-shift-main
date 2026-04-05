'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
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
  SkipForward,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { parseLineChat, type ParseResult, type ParsedStaff } from '@/lib/line-parser';
import { autoAssign, type AssignResult, DEFAULT_TIME_SLOTS } from '@/lib/line-parser/assigner';

type Step = 'input' | 'parsed' | 'assigned' | 'fill-gaps' | 'complete';

const STEPS: { id: Step; label: string }[] = [
  { id: 'input', label: '1. 貼り付け' },
  { id: 'parsed', label: '2. 解析結果' },
  { id: 'assigned', label: '3. 自動配置' },
  { id: 'fill-gaps', label: '4. 社員配置' },
  { id: 'complete', label: '5. 完成' },
];

const STEP_ORDER: Step[] = STEPS.map(s => s.id);

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function getDayOfWeek(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  return DAY_NAMES[d.getDay()];
}

interface ShiftCreateContentProps {
  user: SessionUser;
}

export function ShiftCreateContent({ user }: ShiftCreateContentProps) {
  const [step, setStep] = useState<Step>('input');

  // STEP 1: 入力
  const [lineText, setLineText] = useState('');
  const [targetMonth, setTargetMonth] = useState(String(new Date().getMonth() + 1));
  const [targetHalf, setTargetHalf] = useState<'first' | 'second'>('first');
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear()));

  // STEP 2: 解析結果
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // STEP 3: 自動配置結果
  const [assignResult, setAssignResult] = useState<AssignResult | null>(null);

  // STEP 4: 社員配置
  const [currentGapIndex, setCurrentGapIndex] = useState(0);
  const [manualShifts, setManualShifts] = useState<{ day: number; slotId: string; name: string }[]>([]);
  const [managerName, setManagerName] = useState(user.name);

  // 連打防止
  const isProcessingRef = useRef(false);

  // 全ステートリセット
  const resetAll = useCallback(() => {
    setStep('input');
    setLineText('');
    setParseResult(null);
    setAssignResult(null);
    setManualShifts([]);
    setCurrentGapIndex(0);
  }, []);

  // ========== STEP 1: 解析 ==========
  const handleParse = useCallback(() => {
    if (!lineText.trim()) return;

    const result = parseLineChat(
      lineText,
      parseInt(targetMonth),
      targetHalf,
      parseInt(targetYear)
    );

    setParseResult(result);
    // 下流ステートをクリア
    setAssignResult(null);
    setManualShifts([]);
    setCurrentGapIndex(0);
    setStep('parsed');
  }, [lineText, targetMonth, targetHalf, targetYear]);

  // ========== STEP 2 → 3: 自動配置 ==========
  const handleAutoAssign = useCallback(() => {
    if (!parseResult) return;

    const result = autoAssign(parseResult);
    setAssignResult(result);
    setCurrentGapIndex(0);
    setManualShifts([]);
    setStep('assigned');
  }, [parseResult]);

  // ========== STEP 3 → 4: 社員配置開始 ==========
  const handleStartFillGaps = useCallback(() => {
    setCurrentGapIndex(0);
    setManualShifts([]);
    setStep('fill-gaps');
  }, []);

  // ========== STEP 4: 社員配置操作 ==========
  const currentGap = useMemo(() => {
    if (!assignResult || assignResult.gaps.length === 0) return null;
    if (currentGapIndex >= assignResult.gaps.length) return null;
    return assignResult.gaps[currentGapIndex];
  }, [assignResult, currentGapIndex]);

  const advanceGap = useCallback(() => {
    if (!assignResult) return;
    if (currentGapIndex < assignResult.gaps.length - 1) {
      setCurrentGapIndex(prev => prev + 1);
    } else {
      setStep('complete');
    }
  }, [assignResult, currentGapIndex]);

  const handleFillGap = useCallback(() => {
    if (!currentGap || isProcessingRef.current) return;
    isProcessingRef.current = true;

    setManualShifts(prev => [...prev, {
      day: currentGap.day,
      slotId: currentGap.slotId,
      name: managerName,
    }]);
    advanceGap();

    // 次のレンダーサイクルでロック解除
    requestAnimationFrame(() => { isProcessingRef.current = false; });
  }, [currentGap, managerName, advanceGap]);

  const handleSkipGap = useCallback(() => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    advanceGap();
    requestAnimationFrame(() => { isProcessingRef.current = false; });
  }, [advanceGap]);

  // ========== 集計 ==========
  const finalStats = useMemo(() => {
    if (!assignResult) return null;
    const manualCount = manualShifts.length;
    const totalFilled = assignResult.stats.filledSlots + manualCount;
    const totalSlots = assignResult.stats.totalSlots;

    // 残りギャップ: ギャップごとにmanualShiftsで埋めた分を引く
    const filledGapKeys = new Set(
      manualShifts.map(s => `${s.day}-${s.slotId}`)
    );
    const remainingGaps = assignResult.gaps.filter(
      g => !filledGapKeys.has(`${g.day}-${g.slotId}`)
    ).length;

    return {
      autoFilled: assignResult.stats.filledSlots,
      manualFilled: manualCount,
      totalFilled,
      totalSlots,
      coveragePercent: totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0,
      remainingGaps,
    };
  }, [assignResult, manualShifts]);

  // ========== シフト表データ ==========
  const shiftTableData = useMemo(() => {
    if (!assignResult || !parseResult) return null;

    const { period } = parseResult;
    const startDay = period.half === 'first' ? 1 : 16;
    const daysInMonth = new Date(period.year, period.month, 0).getDate();
    const endDay = period.half === 'first' ? 15 : daysInMonth;

    const days: number[] = [];
    for (let d = startDay; d <= endDay; d++) days.push(d);

    return { days, period };
  }, [assignResult, parseResult]);

  // ========== レンダリング ==========
  return (
    <DashboardLayout
      user={user}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-[#007AFF]" />
          LINE → シフト自動作成
        </span>
      }
      description="LINEトーク履歴を貼り付けて、AIでシフトを自動生成"
    >
      {/* ステップインジケーター */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isPast = STEP_ORDER.indexOf(step) > i;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-shrink-0">
              {i > 0 && <ChevronRight className="w-4 h-4 text-[#D2D2D7]" />}
              <Badge
                variant={isActive ? 'default' : 'outline'}
                className={`text-xs whitespace-nowrap ${
                  isActive ? 'bg-[#007AFF] text-white' :
                  isPast ? 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/30' :
                  'text-[#86868B] border-[#E5E5EA]'
                }`}
              >
                {isPast && !isActive ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
                {s.label}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* ========== STEP 1: 入力 ========== */}
      {step === 'input' && (
        <PageSection>
          <h2 className="text-lg font-bold text-[#1D1D1F] mb-4">
            LINEトーク履歴を貼り付けてください
          </h2>

          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={targetYear} onValueChange={setTargetYear}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025年</SelectItem>
                <SelectItem value="2026">2026年</SelectItem>
                <SelectItem value="2027">2027年</SelectItem>
              </SelectContent>
            </Select>

            <Select value={targetMonth} onValueChange={setTargetMonth}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}月</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={targetHalf} onValueChange={(v) => setTargetHalf(v as 'first' | 'second')}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first">前半</SelectItem>
                <SelectItem value="second">後半</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <textarea
            value={lineText}
            onChange={(e) => setLineText(e.target.value)}
            placeholder={'LINEのトーク履歴をここに貼り付けてください...\n\n例:\n【名前】温水直也\n1（水）×\n2（木）9-17\n...'}
            className="w-full h-64 sm:h-80 p-4 border border-[#E5E5EA] rounded-xl resize-y font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent"
          />

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-[#86868B]">
              {lineText.length > 0 ? `${lineText.length.toLocaleString()}文字` : 'テキストを貼り付けてください'}
            </p>
            <Button
              onClick={handleParse}
              disabled={!lineText.trim()}
              className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl px-6"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              解析する
            </Button>
          </div>
        </PageSection>
      )}

      {/* ========== STEP 2: 解析結果 ========== */}
      {step === 'parsed' && parseResult && (
        <PageSection>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1D1D1F]">
              解析結果: {parseResult.period.year}年{parseResult.period.month}月
              {parseResult.period.half === 'first' ? '前半' : '後半'}
            </h2>
            <Badge className="bg-[#34C759] text-white">
              {parseResult.staff.length}名分を検出
            </Badge>
          </div>

          {parseResult.warnings.length > 0 && (
            <div className="bg-[#FF9500]/10 border border-[#FF9500]/30 rounded-xl p-3 mb-4">
              {parseResult.warnings.map((w, i) => (
                <p key={i} className="text-sm text-[#FF9500] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}

          {parseResult.staff.length === 0 && (
            <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-xl p-4 mb-4 text-center">
              <p className="text-sm text-[#FF3B30]">
                シフト希望が見つかりませんでした。期間の選択が正しいか確認してください。
              </p>
            </div>
          )}

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {parseResult.staff.map((s) => (
              <StaffParseCard key={s.name} staff={s} period={parseResult.period} />
            ))}
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#E5E5EA]">
            <Button
              variant="outline"
              onClick={() => setStep('input')}
              className="rounded-xl"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              戻る
            </Button>
            <Button
              onClick={handleAutoAssign}
              disabled={parseResult.staff.length === 0}
              className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl px-6"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              シフトを自動配置
            </Button>
          </div>
        </PageSection>
      )}

      {/* ========== STEP 3+: 自動配置結果 + シフト表 ========== */}
      {(step === 'assigned' || step === 'fill-gaps' || step === 'complete') && assignResult && shiftTableData && parseResult && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatBadge label="自動配置" value={`${assignResult.stats.filledSlots}枠`} color="blue" />
            <StatBadge label="不足枠" value={`${assignResult.gaps.length}枠`} color={assignResult.gaps.length > 0 ? 'red' : 'green'} />
            <StatBadge label="社員配置" value={`${manualShifts.length}枠`} color="green" />
            <StatBadge
              label="カバー率"
              value={`${finalStats?.coveragePercent ?? assignResult.stats.coveragePercent}%`}
              color={
                (finalStats?.coveragePercent ?? assignResult.stats.coveragePercent) >= 80 ? 'green' :
                (finalStats?.coveragePercent ?? assignResult.stats.coveragePercent) >= 60 ? 'yellow' : 'red'
              }
            />
          </div>

          <PageSection className="overflow-x-auto">
            <h2 className="text-lg font-bold text-[#1D1D1F] mb-4">
              シフト表: {parseResult.period.month}月{parseResult.period.half === 'first' ? '前半' : '後半'}
            </h2>

            <div className="min-w-[700px]">
              <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-2">
                <div className="text-xs font-medium text-[#86868B] text-center">日付</div>
                {DEFAULT_TIME_SLOTS.map(slot => (
                  <div key={slot.id} className="text-xs font-medium text-[#86868B] text-center">
                    {slot.label}
                    <br />
                    <span className="text-[10px]">{slot.start}-{slot.end}</span>
                    <br />
                    <span className="text-[10px]">({slot.required}人)</span>
                  </div>
                ))}
              </div>

              {shiftTableData.days.map(day => {
                const { year, month } = shiftTableData.period;
                const dow = getDayOfWeek(year, month, day);
                const isWeekend = dow === '土' || dow === '日';

                return (
                  <div
                    key={day}
                    className={`grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1 ${
                      isWeekend ? 'bg-[#F5F5F7]' : ''
                    } rounded-lg`}
                  >
                    <div className={`text-sm font-medium text-center py-2 rounded-lg ${
                      dow === '日' ? 'text-[#FF3B30]' :
                      dow === '土' ? 'text-[#007AFF]' :
                      'text-[#1D1D1F]'
                    }`}>
                      {month}/{day}({dow})
                    </div>
                    {DEFAULT_TIME_SLOTS.map(slot => {
                      const assigned = assignResult.shifts.filter(
                        s => s.day === day && s.slotId === slot.id
                      );
                      const manual = manualShifts.filter(
                        s => s.day === day && s.slotId === slot.id
                      );
                      const gap = assignResult.gaps.find(
                        g => g.day === day && g.slotId === slot.id
                      );
                      const isCurrentGap = step === 'fill-gaps' && currentGap?.day === day && currentGap?.slotId === slot.id;

                      const totalAssigned = assigned.length + manual.length;
                      const isFull = totalAssigned >= slot.required;

                      return (
                        <div
                          key={slot.id}
                          className={`text-xs py-2 px-2 rounded-lg min-h-[40px] transition-all ${
                            isCurrentGap ? 'ring-2 ring-[#007AFF] bg-[#007AFF]/10' :
                            isFull ? 'bg-[#34C759]/10 border border-[#34C759]/20' :
                            gap ? 'bg-[#FF3B30]/10 border border-[#FF3B30]/20' :
                            'bg-[#34C759]/10 border border-[#34C759]/20'
                          }`}
                        >
                          {assigned.map((s, i) => (
                            <div key={`a-${s.staffName}-${i}`} className="text-[#1D1D1F] truncate">
                              {s.staffName}
                              <span className="text-[10px] text-[#86868B] ml-1">
                                {s.startTime}-{s.endTime}
                              </span>
                            </div>
                          ))}
                          {manual.map((s, i) => (
                            <div key={`m-${s.name}-${i}`} className="text-[#007AFF] font-medium truncate">
                              {s.name} (社員)
                            </div>
                          ))}
                          {gap && !isFull && (
                            <div className="text-[#FF3B30] text-[10px] mt-0.5">
                              -{gap.shortage}人不足
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </PageSection>

          {step === 'assigned' && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                onClick={() => setStep('parsed')}
                className="rounded-xl"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                戻る
              </Button>
              {assignResult.gaps.length > 0 ? (
                <Button
                  onClick={handleStartFillGaps}
                  className="bg-[#FF9500] hover:bg-[#E68600] text-white rounded-xl px-6"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  社員を配置する（{assignResult.gaps.length}枠）
                </Button>
              ) : (
                <Button
                  onClick={() => setStep('complete')}
                  className="bg-[#34C759] hover:bg-[#2DB84E] text-white rounded-xl px-6"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  完了
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* ========== STEP 4: 社員配置ウィザード ========== */}
      {step === 'fill-gaps' && currentGap && assignResult && parseResult && (
        <PageSection className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1D1D1F] flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#FF9500]" />
              社員配置
            </h2>
            <Badge variant="outline" className="text-sm">
              {currentGapIndex + 1} / {assignResult.gaps.length}
            </Badge>
          </div>

          <div className="bg-[#FF9500]/10 border border-[#FF9500]/30 rounded-2xl p-6 text-center">
            <p className="text-2xl font-bold text-[#1D1D1F] mb-2">
              {parseResult.period.month}/{currentGap.day}
              ({getDayOfWeek(parseResult.period.year, parseResult.period.month, currentGap.day)})
              &nbsp;{currentGap.slotLabel}
            </p>
            <p className="text-lg text-[#86868B] mb-1">
              {currentGap.startTime} 〜 {currentGap.endTime}
            </p>
            <p className="text-[#FF3B30] font-medium">
              あと{currentGap.shortage}人足りません
            </p>
          </div>

          <div className="mt-4 mb-4">
            <label className="text-sm text-[#86868B] mb-1 block">配置する社員名</label>
            <input
              type="text"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              className="w-full px-4 py-2 border border-[#E5E5EA] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleFillGap}
              disabled={!managerName.trim()}
              className="flex-1 bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl h-14 text-base"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              自分を入れる
            </Button>
            <Button
              onClick={handleSkipGap}
              variant="outline"
              className="flex-1 rounded-xl h-14 text-base border-[#E5E5EA]"
            >
              <SkipForward className="w-5 h-5 mr-2" />
              スキップ
            </Button>
          </div>

          <div className="mt-4">
            <div className="w-full bg-[#E5E5EA] rounded-full h-2">
              <div
                className="bg-[#007AFF] rounded-full h-2 transition-all duration-300"
                style={{ width: `${((currentGapIndex + 1) / assignResult.gaps.length) * 100}%` }}
              />
            </div>
          </div>
        </PageSection>
      )}

      {/* ========== STEP 5: 完成 ========== */}
      {step === 'complete' && finalStats && (
        <PageSection className="mt-4">
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-[#34C759] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#1D1D1F] mb-2">
              シフト作成完了
            </h2>
            <p className="text-[#86868B] mb-6">
              カバー率: {finalStats.coveragePercent}%
              （自動{finalStats.autoFilled}枠 + 社員{finalStats.manualFilled}枠）
            </p>

            {finalStats.remainingGaps > 0 && (
              <div className="bg-[#FF9500]/10 border border-[#FF9500]/30 rounded-xl p-4 mb-6 max-w-md mx-auto">
                <p className="text-sm text-[#FF9500]">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  残り{finalStats.remainingGaps}枠が未配置です。ヘルプ募集で対応してください。
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('assigned');
                  setCurrentGapIndex(0);
                }}
                className="rounded-xl"
              >
                シフト表を確認
              </Button>
              <Button
                onClick={resetAll}
                className="bg-[#007AFF] hover:bg-[#0056CC] text-white rounded-xl"
              >
                新しいシフトを作成
              </Button>
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
            {staff.lineName !== staff.name && (
              <p className="text-[10px] text-[#86868B]">LINE: {staff.lineName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {staff.constraints && (
            <Badge variant="outline" className="text-[10px] border-[#FF9500]/30 text-[#FF9500]">
              {staff.constraints[0]}
            </Badge>
          )}
          <Badge variant="outline" className={`text-xs ${
            availableDays > 0 ? 'border-[#34C759]/30 text-[#34C759]' : 'border-[#FF3B30]/30 text-[#FF3B30]'
          }`}>
            {availableDays}/{totalDays}日可
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {staff.entries.map((entry) => {
          const dow = getDayOfWeek(period.year, period.month, entry.day);
          return (
            <div
              key={entry.day}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                !entry.available
                  ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                  : 'bg-[#34C759]/10 text-[#34C759]'
              }`}
              title={entry.startTime ? `${entry.startTime}-${entry.endTime}` : entry.available ? '可' : '不可'}
            >
              {entry.day}({dow})
              {entry.available && entry.startTime && (
                <span className="ml-0.5">{entry.startTime.slice(0, 5)}</span>
              )}
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
