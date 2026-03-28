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

interface StaffMember {
  id: number;
  name: string;
  canWorkOtherStores: boolean;
  storeId: number;
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
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user.storeId?.toString() || '');
  const [date, setDate] = useState<string>(getTodayStr());
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const isAdmin = user.role === 'owner' || user.role === 'manager';
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

  const fetchStaff = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const storeParam = user.role === 'owner' && selectedStoreId
        ? `?storeId=${selectedStoreId}`
        : user.storeId
        ? `?storeId=${user.storeId}`
        : '';
      const res = await fetch(`/api/staff${storeParam}`);
      if (res.ok) {
        const data = await res.json();
        // can_work_other_stores が true のスタッフのみ
        setStaffMembers(data.filter((s: StaffMember) => s.canWorkOtherStores));
      }
    } catch (err) {
      console.error('スタッフ取得エラー:', err);
    }
  }, [isAdmin, user.role, user.storeId, selectedStoreId]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const endTimeOptions = useMemo(() => {
    if (!startTime) return timeOptions;
    return timeOptions.filter((t) => t > startTime);
  }, [startTime, timeOptions]);

  const validationError = useMemo(() => {
    if (isAdmin && !selectedStaffId) return 'スタッフを選択してください';
    if (!date) return '日付を選択してください';
    if (date < todayStr) return '過去の日付は選択できません';
    if (!startTime) return '開始時間を選択してください';
    if (!endTime) return '終了時間を選択してください';
    if (endTime <= startTime) return '終了時間は開始時間より後にしてください';
    if (memo.length > 50) return 'メモは50文字以内にしてください';
    return '';
  }, [isAdmin, selectedStaffId, date, todayStr, startTime, endTime, memo]);

  const handleSubmit = useCallback(async () => {
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        availableDate: date,
        availableStart: startTime,
        availableEnd: endTime,
        memo: memo.trim() || null,
      };

      if (isAdmin && selectedStaffId) {
        body.staffId = parseInt(selectedStaffId);
      }

      const res = await fetch('/api/proactive-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push('/dashboard/extra-shifts');
      } else {
        const data = await res.json();
        setError(data.error || '勤務希望の作成に失敗しました');
      }
    } catch (err) {
      console.error('作成エラー:', err);
      setError('勤務希望の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }, [validationError, date, startTime, endTime, memo, isAdmin, selectedStaffId, router]);

  const backButton = (
    <Button
      variant="outline"
      onClick={() => router.push('/dashboard/extra-shifts')}
      className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
    >
      <ArrowLeft className="w-4 h-4 mr-1" />
      勤務希望ボードへ戻る
    </Button>
  );

  return (
    <DashboardLayout
      user={user}
      title={isAdmin ? '追加勤務希望を出す' : '追加で働きたい！'}
      description={isAdmin ? 'スタッフの働ける日時を登録してください' : 'この日ヒマだから働けるよ！という日時を登録してください。店長に通知が届きます。'}
      actions={backButton}
    >
      <PageSection className="max-w-lg">
        <div className="space-y-6">
          {/* スタッフ向け：自分の名前を表示 */}
          {!isAdmin && (
            <div className="p-3 bg-[#F5F5F7] rounded-xl">
              <p className="text-sm text-[#86868B]">登録者</p>
              <p className="text-base font-semibold text-[#1D1D1F]">{user.name}</p>
            </div>
          )}

          {/* オーナー向け：店舗選択 */}
          {user.role === 'owner' && (
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
                店舗 <span className="text-[#FF3B30]">*</span>
              </label>
              <Select
                value={selectedStoreId}
                onValueChange={(v) => {
                  setSelectedStoreId(v);
                  setSelectedStaffId('');
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
                スタッフの所属店舗を選択してください
              </p>
            </div>
          )}

          {/* マネージャー/オーナー向け：スタッフ選択 */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
                スタッフ <span className="text-[#FF3B30]">*</span>
              </label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="w-full border-[#E5E5EA] bg-white">
                  <SelectValue placeholder="スタッフを選択" />
                </SelectTrigger>
                <SelectContent>
                  {staffMembers.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {staffMembers.length === 0 && (
                <p className="text-xs text-[#FF9500] mt-1">
                  他店勤務可能なスタッフがいません
                </p>
              )}
              <p className="text-xs text-[#86868B] mt-1">
                他店舗勤務可能なスタッフのみ表示されます
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

          {/* メモ */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              メモ（任意）
            </label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={50}
              placeholder={isAdmin ? '例: どこの店でもOKです' : '例: どこの店舗でも大丈夫です！'}
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
              {submitting ? '送信中...' : isAdmin ? '勤務希望を登録' : '働けます！と伝える'}
            </Button>
          </div>
        </div>
      </PageSection>
    </DashboardLayout>
  );
}
