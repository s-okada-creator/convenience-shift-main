'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, CalendarDays, Users, FileText, Briefcase, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { SessionUser } from '@/lib/auth';

interface ShiftPosting {
  id: number;
  storeName: string;
  storeId: number;
  date: string;
  startTime: string;
  endTime: string;
  slotsTotal: number;
  slotsFilled: number;
  description: string | null;
  status: 'open' | 'filled' | 'closed';
  myApplication?: {
    id: number;
    status: 'pending' | 'confirmed' | 'rejected';
  } | null;
}

type StatusFilter = 'open' | 'filled' | 'closed';

const STATUS_CONFIG: Record<StatusFilter, { label: string; bgColor: string; textColor: string }> = {
  open: { label: '募集中', bgColor: 'bg-[#34C759]/10', textColor: 'text-[#34C759]' },
  filled: { label: '確定済み', bgColor: 'bg-[#007AFF]/10', textColor: 'text-[#007AFF]' },
  closed: { label: 'クローズ', bgColor: 'bg-[#86868B]/10', textColor: 'text-[#86868B]' },
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = WEEKDAYS[d.getDay()];
  return `${month}/${day}（${weekday}）`;
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function ShiftBoardContent({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [postings, setPostings] = useState<ShiftPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<ShiftPosting | null>(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);

  const isManager = user.role === 'owner' || user.role === 'manager';

  const fetchPostings = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      if (storeFilter !== 'all') {
        params.set('storeId', storeFilter);
      }
      const res = await fetch(`/api/shift-postings?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPostings(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter, storeFilter]);

  useEffect(() => {
    fetchPostings();
  }, [fetchPostings]);

  const handleApplyClick = (posting: ShiftPosting) => {
    setApplyTarget(posting);
    setApplyMessage('');
    setApplyModalOpen(true);
  };

  const handleApplySubmit = async () => {
    if (!applyTarget) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/shift-postings/${applyTarget.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: applyMessage }),
      });
      if (res.ok) {
        setApplyModalOpen(false);
        fetchPostings();
      }
    } catch {
      // ignore
    } finally {
      setApplying(false);
    }
  };

  const stores = Array.from(new Set(postings.map((p) => JSON.stringify({ id: p.storeId, name: p.storeName })))).map(
    (s) => JSON.parse(s) as { id: number; name: string }
  );

  const filteredPostings = postings;

  return (
    <DashboardLayout
      user={user}
      title="シフト求人ボード"
      description="募集中のシフト求人を確認・応募できます"
      actions={
        isManager ? (
          <Link href="/dashboard/shift-board/create">
            <Button className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              求人を出す
            </Button>
          </Link>
        ) : undefined
      }
    >
      {/* フィルター */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* ステータスタブ */}
        <div className="flex bg-[#F5F5F7] rounded-xl p-1 gap-1">
          {(Object.keys(STATUS_CONFIG) as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                statusFilter === status
                  ? 'bg-white text-[#1D1D1F] shadow-sm'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              {STATUS_CONFIG[status].label}
            </button>
          ))}
        </div>

        {/* 店舗フィルター（owner用） */}
        {user.role === 'owner' && stores.length > 0 && (
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[#E5E5EA] bg-white text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
          >
            <option value="all">全店舗</option>
            {stores.map((store) => (
              <option key={store.id} value={String(store.id)}>
                {store.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* カード一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#86868B] animate-spin" />
        </div>
      ) : filteredPostings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-[#F5F5F7] rounded-2xl flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-[#86868B]" />
          </div>
          <p className="text-sm text-[#86868B]">
            {statusFilter === 'open'
              ? '現在募集中の求人はありません'
              : statusFilter === 'filled'
              ? '確定済みの求人はありません'
              : 'クローズ済みの求人はありません'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPostings.map((posting) => {
            const slotsRemaining = posting.slotsTotal - posting.slotsFilled;
            const statusConf = STATUS_CONFIG[posting.status];
            const hasApplied = posting.myApplication != null;
            const applicationStatus = posting.myApplication?.status;

            return (
              <div
                key={posting.id}
                className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4 sm:p-5 hover:shadow-md transition-shadow duration-200 flex flex-col"
              >
                {/* ヘッダー: 店舗名 + ステータス */}
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-base font-semibold text-[#1D1D1F] truncate">
                    {posting.storeName}
                  </h3>
                  <Badge
                    className={`${statusConf.bgColor} ${statusConf.textColor} border-0 text-xs font-medium shrink-0 ml-2`}
                  >
                    {statusConf.label}
                  </Badge>
                </div>

                {/* 詳細情報 */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
                    <CalendarDays className="w-4 h-4 text-[#86868B] shrink-0" />
                    <span>
                      {formatDate(posting.date)} {formatTime(posting.startTime)}〜{formatTime(posting.endTime)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
                    <Users className="w-4 h-4 text-[#86868B] shrink-0" />
                    <span>
                      残り<span className={`font-semibold ${slotsRemaining > 0 ? 'text-[#FF9500]' : 'text-[#86868B]'}`}>{slotsRemaining}枠</span>
                      （{posting.slotsFilled}/{posting.slotsTotal}名確定）
                    </span>
                  </div>
                  {posting.description && (
                    <div className="flex items-start gap-2 text-sm text-[#86868B]">
                      <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{posting.description}</span>
                    </div>
                  )}
                </div>

                {/* アクション */}
                <div className="mt-4 pt-3 border-t border-[#F5F5F7]">
                  {isManager ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/shift-board/${posting.id}`)}
                      className="w-full text-center text-sm font-medium text-[#007AFF] hover:text-[#0056b3] transition-colors py-1"
                    >
                      詳細を見る
                    </button>
                  ) : hasApplied ? (
                    <div className="text-center">
                      <Badge
                        className={`text-xs font-medium border-0 ${
                          applicationStatus === 'confirmed'
                            ? 'bg-[#34C759]/10 text-[#34C759]'
                            : applicationStatus === 'rejected'
                            ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                            : 'bg-[#FF9500]/10 text-[#FF9500]'
                        }`}
                      >
                        {applicationStatus === 'confirmed'
                          ? '確定済み'
                          : applicationStatus === 'rejected'
                          ? '見送り'
                          : '応募済み'}
                      </Badge>
                    </div>
                  ) : posting.status === 'open' && slotsRemaining > 0 ? (
                    <Button
                      onClick={() => handleApplyClick(posting)}
                      className="w-full bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl text-sm"
                    >
                      応募する
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-[#86868B]">募集終了</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 応募モーダル */}
      <Dialog open={applyModalOpen} onOpenChange={setApplyModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1D1D1F]">
              シフト求人に応募
            </DialogTitle>
            <DialogDescription className="text-sm text-[#86868B]">
              {applyTarget && (
                <>
                  {applyTarget.storeName} / {formatDate(applyTarget.date)}{' '}
                  {formatTime(applyTarget.startTime)}〜{formatTime(applyTarget.endTime)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1.5">
              メッセージ（任意）
            </label>
            <textarea
              value={applyMessage}
              onChange={(e) => setApplyMessage(e.target.value)}
              placeholder="例: レジ対応できます"
              maxLength={100}
              rows={3}
              className="w-full rounded-xl border border-[#E5E5EA] bg-white px-3 py-2 text-sm text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] resize-none"
            />
            <p className="text-xs text-[#86868B] mt-1 text-right">
              {applyMessage.length}/100
            </p>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setApplyModalOpen(false)}
              className="rounded-xl"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleApplySubmit}
              disabled={applying}
              className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl gap-2"
            >
              {applying && <Loader2 className="w-4 h-4 animate-spin" />}
              応募する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
