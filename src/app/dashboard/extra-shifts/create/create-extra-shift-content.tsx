'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface Store {
  id: number;
  name: string;
}

interface CreateExtraShiftContentProps {
  user: SessionUser;
}

function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      options.push(`${hh}:${mm}`);
    }
  }
  return options;
}

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CreateExtraShiftContent({ user }: CreateExtraShiftContentProps) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user.storeId?.toString() || '');
  const [date, setDate] = useState<string>(getTodayStr());
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [slots, setSlots] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const timeOptions = useMemo(() => generateTimeOptions(), []);
  const todayStr = useMemo(() => getTodayStr(), []);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data);
      }
    } catch (err) {
      console.error('店舗取得エラー:', err);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const endTimeOptions = useMemo(() => {
    if (!startTime) return timeOptions;
    return timeOptions.filter((t) => t > startTime);
  }, [startTime, timeOptions]);

  const validationError = useMemo(() => {
    if (user.role === 'owner' && !selectedStoreId) return '店舗を選択してください';
    if (!date) return '日付を選択してください';
    if (date < todayStr) return '過去の日付は選択できません';
    if (!startTime) return '開始時間を選択してください';
    if (!endTime) return '終了時間を選択してください';
    if (endTime <= startTime) return '終了時間は開始時間より後にしてください';
    if (slots < 1) return '募集人数は1人以上にしてください';
    if (description.length > 100) return 'メモは100文字以内にしてください';
    return '';
  }, [user.role, selectedStoreId, date, todayStr, startTime, endTime, slots, description]);

  const handleSubmit = useCallback(async () => {
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        date,
        startTime,
        endTime,
        slots,
        description: description.trim() || null,
      };

      if (user.role === 'owner' && selectedStoreId) {
        body.storeId = parseInt(selectedStoreId);
      }

      const res = await fetch('/api/shift-postings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push('/dashboard/extra-shifts');
      } else {
        const data = await res.json();
        setError(data.error || '募集の投稿に失敗しました');
      }
    } catch (err) {
      console.error('作成エラー:', err);
      setError('募集の投稿に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }, [validationError, date, startTime, endTime, slots, description, user.role, selectedStoreId, router]);

  const backButton = (
    <Button
      variant="outline"
      onClick={() => router.push('/dashboard/extra-shifts')}
      className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
    >
      <ArrowLeft className="w-4 h-4 mr-1" />
      募集ボードへ戻る
    </Button>
  );

  return (
    <DashboardLayout
      user={user}
      title="追加勤務の募集を出す"
      description="人手が足りない日時を投稿して、スタッフからの応募を待ちましょう"
      actions={backButton}
    >
      <PageSection className="max-w-lg">
        <div className="space-y-6">
          {/* オーナー向け：店舗選択 */}
          {user.role === 'owner' && (
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
                募集店舗 <span className="text-[#FF3B30]">*</span>
              </label>
              <Select
                value={selectedStoreId}
                onValueChange={setSelectedStoreId}
              >
                <SelectTrigger className="w-full border-[#E5E5EA] bg-white">
                  <SelectValue placeholder="店舗を選択" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[#86868B] mt-1">
                人手が必要な店舗を選択してください
              </p>
            </div>
          )}

          {/* 日付 */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              日付 <span className="text-[#FF3B30]">*</span>
            </label>
            <Input
              type="date"
              value={date}
              min={todayStr}
              onChange={(e) => setDate(e.target.value)}
              className="border-[#E5E5EA] text-[#1D1D1F]"
            />
          </div>

          {/* 開始時間 */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              開始時間 <span className="text-[#FF3B30]">*</span>
            </label>
            <Select value={startTime} onValueChange={(v) => {
              setStartTime(v);
              if (endTime && endTime <= v) {
                setEndTime('');
              }
            }}>
              <SelectTrigger className="w-full border-[#E5E5EA] bg-white">
                <SelectValue placeholder="開始時間を選択" />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 終了時間 */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              終了時間 <span className="text-[#FF3B30]">*</span>
            </label>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger className="w-full border-[#E5E5EA] bg-white">
                <SelectValue placeholder="終了時間を選択" />
              </SelectTrigger>
              <SelectContent>
                {endTimeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!startTime && (
              <p className="text-xs text-[#86868B] mt-1">
                先に開始時間を選択してください
              </p>
            )}
          </div>

          {/* 募集人数 */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              募集人数
            </label>
            <Select value={slots.toString()} onValueChange={(v) => setSlots(parseInt(v))}>
              <SelectTrigger className="w-full border-[#E5E5EA] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={n.toString()}>
                    {n}人
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* メモ */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              メモ（任意）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={100}
              rows={3}
              placeholder="例: レジ対応できる方歓迎です"
              className="w-full rounded-xl border border-[#E5E5EA] bg-white px-3 py-2 text-sm text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#34C759]/30 focus:border-[#34C759] resize-none"
            />
            <p className="text-xs text-[#86868B] mt-1 text-right">
              {description.length}/100
            </p>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[#FF3B30] shrink-0" />
              <p className="text-sm text-[#FF3B30]">{error}</p>
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/extra-shifts')}
              className="flex-1 rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7] text-[#1D1D1F]"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl"
            >
              {submitting ? '投稿中...' : '募集を投稿'}
            </Button>
          </div>
        </div>
      </PageSection>
    </DashboardLayout>
  );
}
