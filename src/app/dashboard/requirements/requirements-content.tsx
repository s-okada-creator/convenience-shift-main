'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Moon,
  Sunrise,
  Sun,
  Utensils,
  CloudSun,
  Sunset,
  MoonStar,
  Copy,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle,
  Users,
  Sparkles,
  Minus,
  Plus,
  Settings2,
  ChevronDown,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { TIME_SLOTS } from '@/lib/time-constants';

// --- 時間帯ブロック定義 ---

interface TimeBlock {
  id: string;
  label: string;
  icon: React.ElementType;
  startHour: number;
  endHour: number;
  defaultCount: number;
  color: string;
}

const TIME_BLOCKS: TimeBlock[] = [
  { id: 'midnight', label: '深夜',   icon: Moon,     startHour: 0,  endHour: 6,  defaultCount: 2, color: '#5856D6' },
  { id: 'early',    label: '早朝',   icon: Sunrise,  startHour: 6,  endHour: 9,  defaultCount: 3, color: '#FF9500' },
  { id: 'morning',  label: '午前',   icon: Sun,      startHour: 9,  endHour: 12, defaultCount: 2, color: '#007AFF' },
  { id: 'lunch',    label: '昼',     icon: Utensils, startHour: 12, endHour: 14, defaultCount: 3, color: '#34C759' },
  { id: 'afternoon',label: '午後',   icon: CloudSun, startHour: 14, endHour: 17, defaultCount: 2, color: '#007AFF' },
  { id: 'evening',  label: '夕方',   icon: Sunset,   startHour: 17, endHour: 21, defaultCount: 3, color: '#FF9500' },
  { id: 'night',    label: '夜',     icon: MoonStar, startHour: 21, endHour: 24, defaultCount: 2, color: '#5856D6' },
];

function getSlotsForBlock(block: TimeBlock): string[] {
  return TIME_SLOTS.filter(slot => {
    const hour = parseInt(slot.split(':')[0], 10);
    return hour >= block.startHour && hour < block.endHour;
  });
}

function getBlockForSlot(timeSlot: string): TimeBlock | undefined {
  const hour = parseInt(timeSlot.split(':')[0], 10);
  return TIME_BLOCKS.find(b => hour >= b.startHour && hour < b.endHour);
}

interface Store { id: number; name: string; }
interface ShiftRequirement { id: number; storeId: number; dayOfWeek: number; timeSlot: string; requiredCount: number; }

const dayOfWeekShortLabels = ['日', '月', '火', '水', '木', '金', '土'];

// --- 時間帯ブロックカード（ざっくりモード） ---
const TimeBlockCard = memo(function TimeBlockCard({
  block, count, onChange,
}: { block: TimeBlock; count: number; onChange: (count: number) => void }) {
  const Icon = block.icon;
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-[#E5E5EA] bg-white hover:shadow-sm transition-all">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${block.color}15` }}>
          <Icon className="w-5 h-5" style={{ color: block.color }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1D1D1F]">{block.label}</p>
          <p className="text-xs text-[#86868B]">
            {String(block.startHour).padStart(2, '0')}:00 〜 {String(block.endHour).padStart(2, '0')}:00
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
          onClick={() => onChange(Math.max(0, count - 1))}><Minus className="w-4 h-4" /></Button>
        <div className="w-12 text-center">
          <span className="text-2xl font-bold" style={{ color: count > 0 ? block.color : '#D2D2D7' }}>{count}</span>
          <p className="text-[10px] text-[#86868B]">人</p>
        </div>
        <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
          onClick={() => onChange(count + 1)}><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );
});

// --- 詳細設定の30分スロット行 ---
const DetailSlotRow = memo(function DetailSlotRow({
  timeSlot, count, blockColor, onChange,
}: { timeSlot: string; count: number; blockColor: string; onChange: (count: number) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3">
      <span className="text-sm text-[#1D1D1F] font-mono w-16">{timeSlot}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(0, count - 1))}
          className="w-7 h-7 rounded-lg border border-[#E5E5EA] flex items-center justify-center text-[#86868B] hover:bg-[#F5F5F7] transition-colors">
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-bold w-6 text-center" style={{ color: count > 0 ? blockColor : '#D2D2D7' }}>{count}</span>
        <button onClick={() => onChange(count + 1)}
          className="w-7 h-7 rounded-lg border border-[#E5E5EA] flex items-center justify-center text-[#86868B] hover:bg-[#F5F5F7] transition-colors">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

// --- 詳細設定のブロックセクション ---
const DetailBlockSection = memo(function DetailBlockSection({
  block, slotCounts, onSlotChange, isOpen, onToggle,
}: {
  block: TimeBlock;
  slotCounts: Map<string, number>;
  onSlotChange: (timeSlot: string, count: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = block.icon;
  const slots = getSlotsForBlock(block);
  const maxCount = Math.max(...slots.map(s => slotCounts.get(s) || 0), 0);

  return (
    <div className="border border-[#E5E5EA] rounded-xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#F5F5F7] hover:bg-[#EBEBEF] transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: block.color }} />
          <span className="text-sm font-semibold text-[#1D1D1F]">{block.label}</span>
          <span className="text-xs text-[#86868B]">
            {String(block.startHour).padStart(2, '0')}:00-{String(block.endHour).padStart(2, '0')}:00
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs" style={{ borderColor: `${block.color}40`, color: block.color }}>
            {maxCount}人
          </Badge>
          <ChevronDown className={`w-4 h-4 text-[#86868B] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen && (
        <div className="divide-y divide-[#E5E5EA]/50 bg-white">
          {slots.map(slot => (
            <DetailSlotRow
              key={slot}
              timeSlot={slot}
              count={slotCounts.get(slot) || 0}
              blockColor={block.color}
              onChange={(count) => onSlotChange(slot, count)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// --- 週間サマリー ---
const WeeklySummary = memo(function WeeklySummary({ storeId }: { storeId: string }) {
  const [weeklyData, setWeeklyData] = useState<Map<number, ShiftRequirement[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/shift-requirements?storeId=${storeId}`);
        if (res.ok) {
          const data: ShiftRequirement[] = await res.json();
          const grouped = new Map<number, ShiftRequirement[]>();
          for (let i = 0; i < 7; i++) grouped.set(i, data.filter(r => r.dayOfWeek === i));
          setWeeklyData(grouped);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [storeId]);

  if (loading) {
    return <div className="grid grid-cols-7 gap-2">{[...Array(7)].map((_, i) => <div key={i} className="h-16 bg-[#E5E5EA] rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {dayOfWeekShortLabels.map((label, index) => {
        const dayReqs = weeklyData.get(index) || [];
        const totalStaff = dayReqs.reduce((acc, r) => acc + r.requiredCount, 0);
        const isSet = dayReqs.length > 0;
        return (
          <div key={index} className={`p-2 rounded-xl border text-center transition-all ${isSet ? 'border-[#007AFF]/30 bg-[#007AFF]/5' : 'border-[#E5E5EA] bg-[#F5F5F7]'}`}>
            <div className={`text-sm font-semibold ${index === 0 ? 'text-[#FF3B30]' : index === 6 ? 'text-[#007AFF]' : 'text-[#1D1D1F]'}`}>{label}</div>
            {isSet ? <div className="text-xs text-[#86868B] mt-1"><Users className="w-3 h-3 inline mr-0.5" />計{totalStaff}人</div>
              : <div className="text-xs text-[#D2D2D7] mt-1">未設定</div>}
          </div>
        );
      })}
    </div>
  );
});

// --- メインコンポーネント ---
export function RequirementsContent({ user }: { user: SessionUser }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveKey, setSaveKey] = useState(0);

  // ざっくりモード（ブロック単位）の状態
  const [blockCounts, setBlockCounts] = useState<Map<string, number>>(new Map());
  // 詳細モード（30分スロット単位）の状態
  const [slotCounts, setSlotCounts] = useState<Map<string, number>>(new Map());
  // ベースライン
  const [baselineSlotCounts, setBaselineSlotCounts] = useState<Map<string, number>>(new Map());

  // モード切替
  const [isDetailMode, setIsDetailMode] = useState(false);
  // 詳細モードのアコーディオン開閉
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());

  const hasChanges = useMemo(() => {
    if (slotCounts.size !== baselineSlotCounts.size) return true;
    for (const [k, v] of slotCounts) {
      if (baselineSlotCounts.get(k) !== v) return true;
    }
    for (const [k, v] of baselineSlotCounts) {
      if (slotCounts.get(k) !== v) return true;
    }
    return false;
  }, [slotCounts, baselineSlotCounts]);

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

  const fetchRequirements = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/shift-requirements?storeId=${selectedStoreId}&dayOfWeek=${selectedDayOfWeek}`);
      if (res.ok) {
        const data: ShiftRequirement[] = await res.json();

        // 30分スロットの状態を構築
        const slots = new Map<string, number>();
        for (const slot of TIME_SLOTS) {
          const req = data.find(r => r.timeSlot === slot);
          slots.set(slot, req ? req.requiredCount : 0);
        }
        setSlotCounts(slots);
        setBaselineSlotCounts(new Map(slots));

        // ブロック単位の状態も構築
        const blocks = new Map<string, number>();
        for (const block of TIME_BLOCKS) {
          const blockSlots = getSlotsForBlock(block);
          const maxCount = Math.max(...blockSlots.map(s => slots.get(s) || 0), 0);
          blocks.set(block.id, maxCount);
        }
        setBlockCounts(blocks);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [selectedStoreId, selectedDayOfWeek]);

  useEffect(() => {
    if (selectedStoreId) fetchRequirements();
  }, [selectedStoreId, selectedDayOfWeek, fetchRequirements]);

  // --- ざっくりモード: ブロック変更 → スロットも連動更新 ---
  const handleBlockChange = useCallback((blockId: string, count: number) => {
    setBlockCounts(prev => { const n = new Map(prev); n.set(blockId, count); return n; });

    const block = TIME_BLOCKS.find(b => b.id === blockId);
    if (!block) return;
    setSlotCounts(prev => {
      const n = new Map(prev);
      for (const slot of getSlotsForBlock(block)) {
        n.set(slot, count);
      }
      return n;
    });
  }, []);

  // --- 詳細モード: スロット変更 → ブロックも連動更新 ---
  const handleSlotChange = useCallback((timeSlot: string, count: number) => {
    setSlotCounts(prev => { const n = new Map(prev); n.set(timeSlot, count); return n; });

    const block = getBlockForSlot(timeSlot);
    if (!block) return;
    // ブロックの値は内部最大値に同期
    setBlockCounts(prev => {
      const n = new Map(prev);
      const blockSlots = getSlotsForBlock(block);
      // 今変更したスロット以外の値を取得
      const otherMaxes = blockSlots
        .filter(s => s !== timeSlot)
        .map(s => slotCounts.get(s) || 0);
      const newMax = Math.max(count, ...otherMaxes);
      n.set(block.id, newMax);
      return n;
    });
  }, [slotCounts]);

  // --- 保存（常にスロット単位で保存） ---
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const requirementsArray: { timeSlot: string; requiredCount: number }[] = [];
      for (const [slot, count] of slotCounts) {
        if (count > 0) requirementsArray.push({ timeSlot: slot, requiredCount: count });
      }

      const res = await fetch('/api/shift-requirements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: parseInt(selectedStoreId), dayOfWeek: selectedDayOfWeek, requirements: requirementsArray }),
      });

      if (res.ok) {
        setBaselineSlotCounts(new Map(slotCounts));
        setSaveKey(prev => prev + 1);
      } else {
        const error = await res.json();
        alert(error.error || '保存に失敗しました');
      }
    } catch { alert('保存に失敗しました'); }
    finally { setSaving(false); }
  }, [slotCounts, selectedStoreId, selectedDayOfWeek]);

  // --- 一括操作 ---
  const handleApplyRecommended = useCallback(() => {
    const blocks = new Map<string, number>();
    const slots = new Map<string, number>();
    for (const block of TIME_BLOCKS) {
      blocks.set(block.id, block.defaultCount);
      for (const slot of getSlotsForBlock(block)) {
        slots.set(slot, block.defaultCount);
      }
    }
    setBlockCounts(blocks);
    setSlotCounts(slots);
  }, []);

  const handleCopyToAllDays = useCallback(async () => {
    if (!confirm('現在の設定を全曜日にコピーしますか？')) return;
    setSaving(true);
    try {
      const requirementsArray: { timeSlot: string; requiredCount: number }[] = [];
      for (const [slot, count] of slotCounts) {
        if (count > 0) requirementsArray.push({ timeSlot: slot, requiredCount: count });
      }
      for (let day = 0; day < 7; day++) {
        await fetch('/api/shift-requirements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: parseInt(selectedStoreId), dayOfWeek: day, requirements: requirementsArray }),
        });
      }
      setBaselineSlotCounts(new Map(slotCounts));
      setSaveKey(prev => prev + 1);
    } catch { alert('コピーに失敗しました'); }
    finally { setSaving(false); }
  }, [slotCounts, selectedStoreId]);

  const handleClear = useCallback(() => {
    const blocks = new Map<string, number>();
    const slots = new Map<string, number>();
    for (const block of TIME_BLOCKS) {
      blocks.set(block.id, 0);
      for (const slot of getSlotsForBlock(block)) slots.set(slot, 0);
    }
    setBlockCounts(blocks);
    setSlotCounts(slots);
  }, []);

  const toggleDetailBlock = useCallback((blockId: string) => {
    setOpenBlocks(prev => {
      const n = new Set(prev);
      if (n.has(blockId)) n.delete(blockId); else n.add(blockId);
      return n;
    });
  }, []);

  return (
    <DashboardLayout
      user={user}
      title="必要人数設定"
      description="時間帯ごとに必要なスタッフ人数を設定"
      actions={user.role === 'owner' && stores.length > 1 ? (
        <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
          <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white"><SelectValue placeholder="店舗を選択" /></SelectTrigger>
          <SelectContent>{stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : undefined}
    >
      <PageSection>
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D1D1F]">時間帯別必要人数</h2>
            <p className="text-sm text-[#86868B]">各時間帯に何人必要か設定してください</p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && <Badge className="bg-[#FF9500]/10 text-[#FF9500] border-0"><AlertCircle className="w-3 h-3 mr-1" />未保存</Badge>}
            <Button onClick={handleSave} disabled={!hasChanges || saving} className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl">
              {saving ? '保存中...' : <><Save className="w-4 h-4 mr-1.5" />保存</>}
            </Button>
          </div>
        </div>

        {/* 曜日タブ */}
        <Tabs value={selectedDayOfWeek.toString()} onValueChange={v => setSelectedDayOfWeek(parseInt(v))} className="mb-6">
          <TabsList className="grid grid-cols-7 w-full bg-[#F5F5F7] p-1 rounded-xl">
            {dayOfWeekShortLabels.map((label, index) => (
              <TabsTrigger key={index} value={String(index)}
                className={`rounded-lg text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm ${
                  index === 0 ? 'data-[state=active]:text-[#FF3B30] text-[#FF3B30]/60' :
                  index === 6 ? 'data-[state=active]:text-[#007AFF] text-[#007AFF]/60' :
                  'data-[state=active]:text-[#1D1D1F] text-[#86868B]'
                }`}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-3 animate-pulse">{[...Array(7)].map((_, i) => <div key={i} className="h-16 bg-[#E5E5EA] rounded-2xl" />)}</div>
        ) : (
          <>
            {/* ===== ざっくりモード（デフォルト） ===== */}
            {!isDetailMode && (
              <div className="space-y-3 mb-6">
                {TIME_BLOCKS.map(block => (
                  <TimeBlockCard key={block.id} block={block} count={blockCounts.get(block.id) || 0}
                    onChange={count => handleBlockChange(block.id, count)} />
                ))}
              </div>
            )}

            {/* ===== 詳細モード（30分刻み） ===== */}
            {isDetailMode && (
              <div className="space-y-2 mb-6">
                {TIME_BLOCKS.map(block => (
                  <DetailBlockSection
                    key={block.id}
                    block={block}
                    slotCounts={slotCounts}
                    onSlotChange={handleSlotChange}
                    isOpen={openBlocks.has(block.id)}
                    onToggle={() => toggleDetailBlock(block.id)}
                  />
                ))}
              </div>
            )}

            {/* 操作ボタン */}
            <div className="border-t border-[#E5E5EA] pt-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => setIsDetailMode(!isDetailMode)}
                  className={`rounded-xl ${isDetailMode ? 'border-[#007AFF] text-[#007AFF] bg-[#007AFF]/5' : 'border-[#E5E5EA]'}`}>
                  <Settings2 className="w-4 h-4 mr-1" />{isDetailMode ? 'ざっくり設定に戻す' : '詳細設定（30分単位）'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleApplyRecommended} disabled={saving}
                  className="rounded-xl border-[#007AFF] text-[#007AFF] hover:bg-[#007AFF]/5">
                  <Sparkles className="w-4 h-4 mr-1" />おすすめ設定
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyToAllDays} disabled={saving}
                  className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]">
                  <Copy className="w-4 h-4 mr-1" />全曜日にコピー
                </Button>
                <Button variant="outline" size="sm" onClick={handleClear}
                  className="rounded-xl border-[#E5E5EA] text-[#FF3B30] hover:bg-[#FF3B30]/5">
                  <Trash2 className="w-4 h-4 mr-1" />クリア
                </Button>
              </div>
            </div>
          </>
        )}
      </PageSection>

      <PageSection className="mt-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[#1D1D1F] flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-[#34C759]" />週間サマリー
          </h2>
        </div>
        <WeeklySummary key={saveKey} storeId={selectedStoreId} />
      </PageSection>
    </DashboardLayout>
  );
}
