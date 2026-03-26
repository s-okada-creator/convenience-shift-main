'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { SessionUser } from '@/lib/auth';

function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return times;
}

function getTodayString(): string {
  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, '0');
  const d = String(jst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function CreatePostingContent({ user }: { user: SessionUser }) {
  const router = useRouter();
  const timeOptions = useMemo(() => generateTimeOptions(), []);
  const today = useMemo(() => getTodayString(), []);

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [slotsTotal, setSlotsTotal] = useState('1');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!date) {
      setError('日付を選択してください');
      return;
    }
    if (startTime >= endTime) {
      setError('終了時間は開始時間より後にしてください');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/shift-postings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          slotsTotal: Number(slotsTotal),
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        router.push('/dashboard/shift-board');
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || '求人の作成に失敗しました');
      }
    } catch {
      setError('求人の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      user={user}
      title={
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/shift-board"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#1D1D1F]" />
          </Link>
          <span>求人を作成</span>
        </div>
      }
      description="シフト求人の詳細を入力してください"
    >
      <div className="max-w-lg mx-auto">
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-5 sm:p-6 space-y-5">
            {/* 店舗（managerは自動、ownerは表示のみ -- API側でstoreIdを決定） */}
            {user.role === 'owner' && (
              <div>
                <Label className="text-sm font-medium text-[#1D1D1F] mb-1.5">店舗</Label>
                <p className="text-xs text-[#86868B]">
                  オーナーの場合、紐づく全店舗に公開されます
                </p>
              </div>
            )}

            {/* 日付 */}
            <div>
              <Label htmlFor="date" className="text-sm font-medium text-[#1D1D1F] mb-1.5">
                日付 <span className="text-[#FF3B30]">*</span>
              </Label>
              <Input
                id="date"
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border-[#E5E5EA] focus:border-[#007AFF] focus:ring-[#007AFF]/30"
                required
              />
            </div>

            {/* 時間 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="startTime" className="text-sm font-medium text-[#1D1D1F] mb-1.5">
                  開始時間 <span className="text-[#FF3B30]">*</span>
                </Label>
                <select
                  id="startTime"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-[#E5E5EA] bg-white text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                >
                  {timeOptions.map((t) => (
                    <option key={`s-${t}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="endTime" className="text-sm font-medium text-[#1D1D1F] mb-1.5">
                  終了時間 <span className="text-[#FF3B30]">*</span>
                </Label>
                <select
                  id="endTime"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-[#E5E5EA] bg-white text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                >
                  {timeOptions.map((t) => (
                    <option key={`e-${t}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 募集人数 */}
            <div>
              <Label htmlFor="slotsTotal" className="text-sm font-medium text-[#1D1D1F] mb-1.5">
                募集人数 <span className="text-[#FF3B30]">*</span>
              </Label>
              <select
                id="slotsTotal"
                value={slotsTotal}
                onChange={(e) => setSlotsTotal(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-[#E5E5EA] bg-white text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}名
                  </option>
                ))}
              </select>
            </div>

            {/* 説明 */}
            <div>
              <Label htmlFor="description" className="text-sm font-medium text-[#1D1D1F] mb-1.5">
                説明（任意）
              </Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 50))}
                placeholder="例: レジ・品出しできる方"
                maxLength={50}
                rows={2}
                className="w-full rounded-xl border border-[#E5E5EA] bg-white px-3 py-2 text-sm text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] resize-none"
              />
              <p className="text-xs text-[#86868B] mt-1 text-right">
                {description.length}/50
              </p>
            </div>

            {/* エラー */}
            {error && (
              <div className="bg-[#FF3B30]/10 text-[#FF3B30] text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* 送信 */}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl h-11 text-sm font-semibold gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              求人を出す
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
