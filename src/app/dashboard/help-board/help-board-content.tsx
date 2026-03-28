'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
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
  AlertTriangle,
  Clock,
  MapPin,
  MessageSquare,
  Plus,
  Inbox,
  Hand,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface Store {
  id: number;
  name: string;
}

interface HelpRequest {
  id: number;
  storeId: number;
  storeName: string;
  needDate: string;
  needStart: string;
  needEnd: string;
  memo: string | null;
  status: 'open' | 'offered' | 'confirmed' | 'closed' | 'withdrawn';
  staffNotified: boolean;
  createdAt: string;
  requestedBy: number;
}

interface HelpBoardContentProps {
  user: SessionUser;
}

type StatusFilter = 'all' | 'open' | 'offered' | 'confirmed' | 'closed';

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: '未対応', color: 'bg-[#FF3B30]/10 text-[#FF3B30]' },
  offered: { label: '申し出あり', color: 'bg-[#FF9500]/10 text-[#FF9500]' },
  confirmed: { label: '確定済み', color: 'bg-[#34C759]/10 text-[#34C759]' },
  closed: { label: 'クローズ', color: 'bg-[#86868B]/10 text-[#86868B]' },
  withdrawn: { label: '取り下げ', color: 'bg-[#86868B]/10 text-[#86868B]' },
};

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const created = new Date(dateStr).getTime();
  const diffMs = now - created;

  if (diffMs < 0) return 'たった今';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'たった今';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}日前`;

  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}ヶ月前`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${month}/${day} (${dayOfWeek})`;
}

function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
}

const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.closed;
  return (
    <Badge className={config.color}>
      {config.label}
    </Badge>
  );
});

const HelpRequestCard = memo(function HelpRequestCard({
  request,
  onClick,
  isStaff,
}: {
  request: HelpRequest;
  onClick: () => void;
  isStaff: boolean;
}) {
  const canApply = isStaff && (request.status === 'open' || request.status === 'offered');

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4 sm:p-5 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#007AFF] active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={request.status} />
            {request.status === 'open' && (
              <span className="flex items-center gap-1 text-xs text-[#FF3B30] font-medium">
                <AlertTriangle className="w-3 h-3" />
                緊急
              </span>
            )}
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
              <MapPin className="w-4 h-4 text-[#86868B] shrink-0" />
              <span className="font-medium truncate">{request.storeName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
              <Clock className="w-4 h-4 text-[#86868B] shrink-0" />
              <span>
                {formatDate(request.needDate)}{' '}
                {formatTimeRange(request.needStart, request.needEnd)}
              </span>
            </div>
            {request.memo && (
              <div className="flex items-start gap-2 text-sm text-[#86868B]">
                <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{request.memo}</span>
              </div>
            )}
            {(() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const needDate = new Date(request.needDate + 'T00:00:00');
              return needDate < today ? (
                <p className="text-[10px] text-[#FF9500]">※ 期日経過 - 2日後に自動削除</p>
              ) : null;
            })()}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <p className="text-xs text-[#86868B]">{getRelativeTime(request.createdAt)}</p>
          {canApply && (
            <Button
              size="sm"
              className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <Hand className="w-3.5 h-3.5 mr-1" />
              応募する
            </Button>
          )}
        </div>
      </div>

      {request.staffNotified && !canApply && (
        <div className="mt-3 pt-3 border-t border-[#E5E5EA]">
          <span className="text-xs font-medium text-[#007AFF]">
            スタッフ通知済み
          </span>
        </div>
      )}
    </div>
  );
});

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

export function HelpBoardContent({ user }: HelpBoardContentProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data);
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStoreId !== 'all') {
        params.append('storeId', selectedStoreId);
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      const res = await fetch(`/api/help-requests?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (error) {
      console.error('ヘルプ要請取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, statusFilter]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const sortedRequests = useMemo(() => {
    const sorted = [...requests].sort((a, b) => {
      // 未対応を先頭にピン留め
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      // 新しい順
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted;
  }, [requests]);

  const handleCardClick = useCallback(
    (id: number) => {
      router.push(`/dashboard/help-board/${id}`);
    },
    [router]
  );

  const storeSelector = user.role === 'owner' ? (
    <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
      <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white">
        <SelectValue placeholder="店舗を選択" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">すべての店舗</SelectItem>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id.toString()}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null;

  const headerActions = (
    <div className="flex items-center gap-3">
      {storeSelector}
      {user.role !== 'staff' && (
        <Button
          onClick={() => router.push('/dashboard/help-board/create')}
          className="bg-[#FF3B30] hover:bg-[#FF453A] text-white rounded-xl shadow-sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          緊急ヘルプ要請
        </Button>
      )}
    </div>
  );

  return (
    <DashboardLayout
      user={user}
      title="ヘルプボード"
      description="店舗間のヘルプ要請と対応状況"
      actions={headerActions}
    >
      <PageSection>
        {/* ステータスフィルタータブ */}
        <div className="mb-6">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <TabsList className="bg-[#E5E5EA]/50 p-1 rounded-xl w-full sm:w-auto flex overflow-x-auto">
              <TabsTrigger
                value="all"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                全て
              </TabsTrigger>
              <TabsTrigger
                value="open"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                未対応
              </TabsTrigger>
              <TabsTrigger
                value="offered"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                申し出あり
              </TabsTrigger>
              <TabsTrigger
                value="confirmed"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                確定済み
              </TabsTrigger>
              <TabsTrigger
                value="closed"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                クローズ
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* ヘルプ要請リスト */}
        {loading ? (
          <LoadingSkeleton />
        ) : sortedRequests.length === 0 ? (
          <EmptyState message="ヘルプ要請はありません" />
        ) : (
          <div className="space-y-3">
            {sortedRequests.map((request) => (
              <HelpRequestCard
                key={request.id}
                request={request}
                onClick={() => handleCardClick(request.id)}
                isStaff={user.role === 'staff'}
              />
            ))}
          </div>
        )}
      </PageSection>
    </DashboardLayout>
  );
}
