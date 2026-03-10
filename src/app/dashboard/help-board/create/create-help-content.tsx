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

interface CreateHelpContentProps {
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

export function CreateHelpContent({ user }: CreateHelpContentProps) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeName, setStoreName] = useState<string>('');
  const [storeId, setStoreId] = useState<number | null>(user.storeId);
  const [date, setDate] = useState<string>(getTodayStr());
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
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
        if (user.storeId) {
          const userStore = data.find((s: Store) => s.id === user.storeId);
          if (userStore) {
            setStoreName(userStore.name);
            setStoreId(userStore.id);
          }
        } else if (user.role === 'owner' && data.length > 0) {
          // オーナーはstoreIdがnullなので、最初の店舗をデフォルトにするか選択させる
          // 選択UIを出すためにstoresだけセットしておく
        }
      }
    } catch (err) {
      console.error('店舗取得エラー:', err);
    }
  }, [user.storeId, user.role]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const endTimeOptions = useMemo(() => {
    if (!startTime) return timeOptions;
    return timeOptions.filter((t) => t > startTime);
  }, [startTime, timeOptions]);

  const validationError = useMemo(() => {
    if (!storeId) return '店舗が設定されていません';
    if (!date) return '日付を選択してください';
    if (date < todayStr) return '過去の日付は選択できません';
    if (!startTime) return '開始時間を選択してください';
    if (!endTime) return '終了時間を選択してください';
    if (endTime <= startTime) return '終了時間は開始時間より後にしてください';
    if (memo.length > 50) return 'メモは50文字以内にしてください';
    return '';
  }, [storeId, date, todayStr, startTime, endTime, memo]);

  const handleSubmit = useCallback(async () => {
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/help-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          needDate: date,
          needStart: startTime,
          needEnd: endTime,
          memo: memo.trim() || null,
        }),
      });

      if (res.ok) {
        router.push('/dashboard/help-board');
      } else {
        const data = await res.json();
        setError(data.error || 'ヘルプ要請の作成に失敗しました');
      }
    } catch (err) {
      console.error('作成エラー:', err);
      setError('ヘルプ要請の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }, [validationError, storeId, date, startTime, endTime, memo, router]);

  const backButton = (
    <Button
      variant="outline"
      onClick={() => router.push('/dashboard/help-board')}
      className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
    >
      <ArrowLeft className="w-4 h-4 mr-1" />
      ヘルプボードへ戻る
    </Button>
  );

  return (
    <DashboardLayout
      user={user}
      title="緊急ヘルプ要請"
      description="ヘルプが必要な日時を入力してください"
      actions={backButton}
    >
      <PageSection className="max-w-lg">
        <div className="space-y-6">
          {/* 店舗名 */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              店舗名
            </label>
            {user.role === 'owner' ? (
              <>
                <Select
                  value={storeId?.toString() || ''}
                  onValueChange={(v) => {
                    const id = parseInt(v);
                    setStoreId(id);
                    const s = stores.find((s) => s.id === id);
                    setStoreName(s?.name || '');
                  }}
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
                  ヘルプが必要な店舗を選択してください
                </p>
              </>
            ) : (
              <>
                <Input
                  value={storeName}
                  readOnly
                  className="bg-[#F5F5F7] border-[#E5E5EA] text-[#1D1D1F] cursor-not-allowed"
                />
                <p className="text-xs text-[#86868B] mt-1">
                  ログイン中の店舗が自動設定されます
                </p>
              </>
            )}
          </div>

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
              // 終了時間が開始時間以前になったらリセット
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

          {/* メモ */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              メモ（任意）
            </label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={50}
              placeholder="例: レジ対応できる方希望"
              className="border-[#E5E5EA] text-[#1D1D1F] placeholder:text-[#86868B]"
            />
            <p className="text-xs text-[#86868B] mt-1 text-right">
              {memo.length}/50
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
              onClick={() => router.push('/dashboard/help-board')}
              className="flex-1 rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7] text-[#1D1D1F]"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-[#FF3B30] hover:bg-[#FF453A] text-white rounded-xl"
            >
              {submitting ? '送信中...' : 'ヘルプ要請を作成'}
            </Button>
          </div>
        </div>
      </PageSection>
    </DashboardLayout>
  );
}
