'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  MapPin,
  Plus,
  Inbox,
  Users,
  FileText,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface ShiftPosting {
  id: number;
  storeId: number;
  storeName: string;
  date: string;
  startTime: string;
  endTime: string;
  slots: number;
  filledCount: number;
  description: string | null;
  status: 'open' | 'filled' | 'closed' | 'expired';
  applicationCount: number;
  createdAt: string;
  myApplication?: {
    id: number;
    status: string;
  } | null;
}

interface ExtraShiftsContentProps {
  user: SessionUser;
}

type StoreTab = 'my-store' | 'other-stores';
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

const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 bg-[#F5F5F7] rounded-2xl animate-pulse" />
      ))}
    </div>
  );
});

const EmptyState = memo(function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <Inbox className="w-12 h-12 text-[#D2D2D7] mx-auto mb-4" />
      <p className="text-[#86868B]">{message}</p>
    </div>
  );
});

export function ExtraShiftsContent({ user }: ExtraShiftsContentProps) {
  const router = useRouter();
  const [postings, setPostings] = useState<ShiftPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeTab, setStoreTab] = useState<StoreTab>('my-store');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<ShiftPosting | null>(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);

  const isAdmin = user.role === 'owner' || user.role === 'manager';

  const fetchPostings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      params.set('source', 'extra-shifts');
      const res = await fetch(`/api/shift-postings?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPostings(data);
      }
    } catch (error) {
      console.error('募集取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchPostings();
  }, [fetchPostings]);

  const filteredPostings = useMemo(() => {
    return postings.filter((p) => {
      if (storeTab === 'my-store') {
        return p.storeId === user.storeId;
      } else {
        return p.storeId !== user.storeId;
      }
    });
  }, [postings, storeTab, user.storeId]);

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
        body: JSON.stringify({ message: applyMessage.trim() || null }),
      });
      if (res.ok) {
        setApplyModalOpen(false);
        fetchPostings();
      } else {
        const data = await res.json();
        alert(data.error || '応募に失敗しました');
      }
    } catch {
      alert('応募に失敗しました');
    } finally {
      setApplying(false);
    }
  };

  const headerActions = isAdmin ? (
    <Link href="/dashboard/extra-shifts/create">
      <Button className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl shadow-sm">
        <Plus className="w-4 h-4 mr-1" />
        募集を出す
      </Button>
    </Link>
  ) : undefined;

  return (
    <DashboardLayout
      user={user}
      title="追加勤務募集ボード"
      description="追加で働きたい方はここから募集を確認・応募できます"
      actions={headerActions}
    >
      <PageSection>
        {/* 自店舗 / 他店舗 タブ */}
        <div className="mb-4">
          <Tabs
            value={storeTab}
            onValueChange={(v) => setStoreTab(v as StoreTab)}
          >
            <TabsList className="bg-[#E5E5EA]/50 p-1 rounded-xl w-full sm:w-auto flex">
              <TabsTrigger
                value="my-store"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                自店舗のヘルプ
              </TabsTrigger>
              <TabsTrigger
                value="other-stores"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                他店舗のヘルプ
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* ステータスフィルター */}
        <div className="mb-6">
          <div className="flex bg-[#F5F5F7] rounded-xl p-1 gap-1 w-full sm:w-auto">
            {(Object.keys(STATUS_CONFIG) as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-1 sm:flex-initial ${
                  statusFilter === status
                    ? 'bg-white text-[#1D1D1F] shadow-sm'
                    : 'text-[#86868B] hover:text-[#1D1D1F]'
                }`}
              >
                {STATUS_CONFIG[status].label}
              </button>
            ))}
          </div>
        </div>

        {/* カード一覧 */}
        {loading ? (
          <LoadingSkeleton />
        ) : filteredPostings.length === 0 ? (
          <EmptyState
            message={
              storeTab === 'my-store'
                ? '自店舗の募集はありません'
                : '他店舗の募集はありません'
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPostings.map((posting) => {
              const slotsRemaining = posting.slots - posting.filledCount;
              const statusConf = STATUS_CONFIG[posting.status as StatusFilter] || STATUS_CONFIG.closed;
              const hasApplied = posting.myApplication != null;
              const applicationStatus = posting.myApplication?.status;

              return (
                <div
                  key={posting.id}
                  className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4 sm:p-5 hover:shadow-md transition-shadow duration-200 flex flex-col"
                >
                  {/* ヘッダー */}
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

                  {/* 詳細 */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
                      <CalendarDays className="w-4 h-4 text-[#86868B] shrink-0" />
                      <span>
                        {formatDate(posting.date)} {formatTime(posting.startTime)}〜
                        {formatTime(posting.endTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
                      <Users className="w-4 h-4 text-[#86868B] shrink-0" />
                      <span>
                        残り
                        <span
                          className={`font-semibold ${
                            slotsRemaining > 0 ? 'text-[#FF9500]' : 'text-[#86868B]'
                          }`}
                        >
                          {slotsRemaining}枠
                        </span>
                        （{posting.filledCount}/{posting.slots}名確定）
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
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/dashboard/extra-shifts/${posting.id}`)
                        }
                        className="w-full text-center text-sm font-medium text-[#34C759] hover:text-[#30D158] transition-colors py-1"
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
                        className="w-full bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl text-sm"
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
      </PageSection>

      {/* 応募モーダル */}
      <Dialog open={applyModalOpen} onOpenChange={setApplyModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1D1D1F]">
              この募集に応募する
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
              placeholder="例: この時間帯なら出れます！"
              maxLength={100}
              rows={3}
              className="w-full rounded-xl border border-[#E5E5EA] bg-white px-3 py-2 text-sm text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#34C759]/30 focus:border-[#34C759] resize-none"
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
              className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl gap-2"
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
