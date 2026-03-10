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
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  MapPin,
  MessageSquare,
  Plus,
  Inbox,
  User,
  CheckCircle,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface Store {
  id: number;
  name: string;
}

interface ProactiveOffer {
  id: number;
  staffId: number;
  staffName: string;
  storeId: number;
  storeName: string;
  availableDate: string;
  availableStart: string;
  availableEnd: string;
  memo: string | null;
  status: string;
  acceptedByStoreId: number | null;
  acceptedBy: number | null;
  createdAt: string;
}

interface ExtraShiftsContentProps {
  user: SessionUser;
}

type StatusFilter = 'all' | 'open' | 'accepted' | 'cancelled';

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: '募集中', color: 'bg-[#34C759]/10 text-[#34C759]' },
  accepted: { label: '確定', color: 'bg-[#007AFF]/10 text-[#007AFF]' },
  cancelled: { label: 'キャンセル', color: 'bg-[#86868B]/10 text-[#86868B]' },
  expired: { label: '期限切れ', color: 'bg-[#86868B]/10 text-[#86868B]' },
};

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

const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.cancelled;
  return (
    <Badge className={config.color}>
      {config.label}
    </Badge>
  );
});

const OfferCard = memo(function OfferCard({
  offer,
  isAdmin,
  onAccept,
  accepting,
}: {
  offer: ProactiveOffer;
  isAdmin: boolean;
  onAccept: (id: number) => void;
  accepting: number | null;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4 sm:p-5 transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={offer.status} />
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
              <User className="w-4 h-4 text-[#86868B] shrink-0" />
              <span className="font-medium truncate">{offer.staffName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
              <MapPin className="w-4 h-4 text-[#86868B] shrink-0" />
              <span className="truncate">{offer.storeName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#1D1D1F]">
              <Clock className="w-4 h-4 text-[#86868B] shrink-0" />
              <span>
                {formatDate(offer.availableDate)}{' '}
                {formatTimeRange(offer.availableStart, offer.availableEnd)}
              </span>
            </div>
            {offer.memo && (
              <div className="flex items-start gap-2 text-sm text-[#86868B]">
                <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{offer.memo}</span>
              </div>
            )}
          </div>
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-2">
          <p className="text-xs text-[#86868B]">{getRelativeTime(offer.createdAt)}</p>
          {isAdmin && offer.status === 'open' && (
            <Button
              size="sm"
              onClick={() => onAccept(offer.id)}
              disabled={accepting === offer.id}
              className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl text-xs"
            >
              {accepting === offer.id ? '処理中...' : 'この人にお願いする'}
            </Button>
          )}
        </div>
      </div>

      {offer.status === 'accepted' && (
        <div className="mt-3 pt-3 border-t border-[#E5E5EA]">
          <span className="flex items-center gap-1 text-xs font-medium text-[#007AFF]">
            <CheckCircle className="w-3 h-3" />
            勤務確定済み
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

export function ExtraShiftsContent({ user }: ExtraShiftsContentProps) {
  const router = useRouter();
  const [offers, setOffers] = useState<ProactiveOffer[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [acceptStoreId, setAcceptStoreId] = useState<string>('');

  const isAdmin = user.role === 'owner' || user.role === 'manager';

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setAllStores(data);
        // マネージャーの場合はデフォルトで自店を受入れ店舗に
        if (user.role === 'manager' && user.storeId) {
          setAcceptStoreId(user.storeId.toString());
        }
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  }, [user.role, user.storeId]);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStoreId !== 'all') {
        params.append('storeId', selectedStoreId);
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      const res = await fetch(`/api/proactive-offers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data);
      }
    } catch (error) {
      console.error('追加勤務希望取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, statusFilter]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const sortedOffers = useMemo(() => {
    const sorted = [...offers].sort((a, b) => {
      // 募集中を先頭にピン留め
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      // 新しい順
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted;
  }, [offers]);

  const handleAccept = useCallback(async (offerId: number) => {
    const targetStoreId = user.role === 'owner' ? acceptStoreId : user.storeId?.toString();
    if (!targetStoreId) {
      alert('受入れ店舗を選択してください');
      return;
    }

    if (!confirm('この勤務希望を受け入れますか？シフトが自動作成されます。')) {
      return;
    }

    setAccepting(offerId);
    try {
      const res = await fetch(`/api/proactive-offers/${offerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          acceptingStoreId: parseInt(targetStoreId),
        }),
      });
      if (res.ok) {
        fetchOffers();
      } else {
        const data = await res.json();
        alert(data.error || '受入れに失敗しました');
      }
    } catch (error) {
      console.error('受入れエラー:', error);
      alert('受入れに失敗しました');
    } finally {
      setAccepting(null);
    }
  }, [user.role, user.storeId, acceptStoreId, fetchOffers]);

  const storeSelector = isAdmin ? (
    <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
      <SelectTrigger className="w-[180px] border-[#E5E5EA] bg-white">
        <SelectValue placeholder="店舗を選択" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">すべての店舗</SelectItem>
        {allStores.map((store) => (
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
      <Button
        onClick={() => router.push('/dashboard/extra-shifts/create')}
        className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl shadow-sm"
      >
        <Plus className="w-4 h-4 mr-1" />
        勤務希望を出す
      </Button>
    </div>
  );

  return (
    <DashboardLayout
      user={user}
      title="追加勤務希望ボード"
      description="追加で働きたいスタッフの一覧"
      actions={headerActions}
    >
      <PageSection>
        {/* オーナー向け：受入れ店舗選択 */}
        {user.role === 'owner' && (
          <div className="mb-4 p-3 bg-[#F5F5F7] rounded-xl">
            <label className="block text-xs font-medium text-[#86868B] mb-1">
              受入れ店舗（お願いする際の勤務先）
            </label>
            <Select value={acceptStoreId} onValueChange={setAcceptStoreId}>
              <SelectTrigger className="w-full border-[#E5E5EA] bg-white">
                <SelectValue placeholder="店舗を選択" />
              </SelectTrigger>
              <SelectContent>
                {allStores.map((store) => (
                  <SelectItem key={store.id} value={store.id.toString()}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
                募集中
              </TabsTrigger>
              <TabsTrigger
                value="accepted"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                確定
              </TabsTrigger>
              <TabsTrigger
                value="cancelled"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm flex-1 sm:flex-initial"
              >
                キャンセル
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* 勤務希望リスト */}
        {loading ? (
          <LoadingSkeleton />
        ) : sortedOffers.length === 0 ? (
          <EmptyState message="追加勤務希望はありません" />
        ) : (
          <div className="space-y-3">
            {sortedOffers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                isAdmin={isAdmin}
                onAccept={handleAccept}
                accepting={accepting}
              />
            ))}
          </div>
        )}
      </PageSection>
    </DashboardLayout>
  );
}
