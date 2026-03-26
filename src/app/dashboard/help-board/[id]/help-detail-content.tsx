'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Clock,
  MapPin,
  MessageSquare,
  Edit2,
  Bell,
  CheckCircle,
  User,
  Users,
  AlertTriangle,
  Hand,
  Send,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface HelpRequestDetail {
  id: number;
  storeId: number;
  storeName: string;
  requestedBy: number;
  requestedByName: string;
  needDate: string;
  needStart: string;
  needEnd: string;
  memo: string | null;
  status: 'open' | 'offered' | 'confirmed' | 'closed' | 'withdrawn';
  staffNotified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface HelpOffer {
  id: number;
  requestId: number;
  offeringStoreId: number;
  offeringStoreName: string;
  staffId: number;
  staffName: string;
  offeredBy: number;
  offerStart: string;
  offerEnd: string;
  isPartial: boolean;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rejected';
  createdAt: string;
}

interface StaffResponse {
  id: number;
  requestId: number;
  staffId: number;
  staffName: string;
  offerStart: string;
  offerEnd: string;
  isPartial: boolean;
  message: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rejected';
  createdAt: string;
}

interface HelpDetailContentProps {
  user: SessionUser;
  helpRequestId: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: '未対応', color: 'bg-[#FF3B30]/10 text-[#FF3B30]' },
  offered: { label: '申し出あり', color: 'bg-[#FF9500]/10 text-[#FF9500]' },
  confirmed: { label: '確定済み', color: 'bg-[#34C759]/10 text-[#34C759]' },
  closed: { label: 'クローズ', color: 'bg-[#86868B]/10 text-[#86868B]' },
  withdrawn: { label: '取り下げ', color: 'bg-[#86868B]/10 text-[#86868B]' },
};

const offerStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '検討中', color: 'bg-[#FF9500]/10 text-[#FF9500]' },
  confirmed: { label: '確定', color: 'bg-[#34C759]/10 text-[#34C759]' },
  cancelled: { label: 'キャンセル', color: 'bg-[#86868B]/10 text-[#86868B]' },
  rejected: { label: '不採用', color: 'bg-[#86868B]/10 text-[#86868B]' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${year}年${month}月${day}日 (${dayOfWeek})`;
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
  return `${diffDay}日前`;
}

// 30分刻みの時間オプション生成
function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      options.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

const StatusBadge = memo(function StatusBadge({ status, config }: { status: string; config: Record<string, { label: string; color: string }> }) {
  const c = config[status] || { label: status, color: 'bg-[#86868B]/10 text-[#86868B]' };
  return <Badge className={c.color}>{c.label}</Badge>;
});

const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-48 bg-[#F5F5F7] rounded-2xl animate-pulse" />
      <div className="h-32 bg-[#F5F5F7] rounded-2xl animate-pulse" />
    </div>
  );
});

const OfferCard = memo(function OfferCard({
  offer,
  isCreator,
  requestStatus,
  onConfirm,
  confirming,
}: {
  offer: HelpOffer;
  isCreator: boolean;
  requestStatus: string;
  onConfirm: (offerId: number) => void;
  confirming: boolean;
}) {
  const canConfirm =
    isCreator &&
    offer.status === 'pending' &&
    (requestStatus === 'open' || requestStatus === 'offered');

  return (
    <div className="bg-white rounded-xl border border-[#E5E5EA] p-4 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#86868B]" />
              <span className="font-medium text-sm text-[#1D1D1F]">{offer.offeringStoreName}</span>
            </div>
            <StatusBadge status={offer.status} config={offerStatusConfig} />
            {offer.isPartial && (
              <Badge className="bg-[#007AFF]/10 text-[#007AFF]">部分対応</Badge>
            )}
          </div>

          {offer.staffName && (
            <div className="flex items-center gap-1.5 mt-2">
              <User className="w-4 h-4 text-[#86868B]" />
              <span className="text-sm text-[#1D1D1F]">{offer.staffName}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-2">
            <Clock className="w-4 h-4 text-[#86868B]" />
            <span className="text-sm text-[#86868B]">
              {formatTimeRange(offer.offerStart, offer.offerEnd)}
            </span>
          </div>

          <p className="text-xs text-[#86868B] mt-2">
            {getRelativeTime(offer.createdAt)}
          </p>
        </div>

        {canConfirm && (
          <Button
            size="sm"
            onClick={() => onConfirm(offer.id)}
            disabled={confirming}
            className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl shrink-0"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            確定
          </Button>
        )}
      </div>
    </div>
  );
});

const StaffResponseCard = memo(function StaffResponseCard({
  response,
  isAdmin,
  requestStatus,
  onConfirm,
  confirming,
}: {
  response: StaffResponse;
  isAdmin: boolean;
  requestStatus: string;
  onConfirm: (responseId: number) => void;
  confirming: boolean;
}) {
  const canConfirm =
    isAdmin &&
    response.status === 'pending' &&
    (requestStatus === 'open' || requestStatus === 'offered');

  return (
    <div className="bg-white rounded-xl border border-[#E5E5EA] p-4 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#86868B]" />
              <span className="font-medium text-sm text-[#1D1D1F]">{response.staffName}</span>
            </div>
            <StatusBadge status={response.status} config={offerStatusConfig} />
            {response.isPartial && (
              <Badge className="bg-[#007AFF]/10 text-[#007AFF]">部分対応</Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            <Clock className="w-4 h-4 text-[#86868B]" />
            <span className="text-sm text-[#86868B]">
              {formatTimeRange(response.offerStart, response.offerEnd)}
            </span>
          </div>

          {response.message && (
            <div className="flex items-start gap-1.5 mt-2">
              <MessageSquare className="w-4 h-4 text-[#86868B] shrink-0 mt-0.5" />
              <span className="text-sm text-[#86868B]">{response.message}</span>
            </div>
          )}

          <p className="text-xs text-[#86868B] mt-2">
            {getRelativeTime(response.createdAt)}
          </p>
        </div>

        {canConfirm && (
          <Button
            size="sm"
            onClick={() => onConfirm(response.id)}
            disabled={confirming}
            className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl shrink-0"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            確定
          </Button>
        )}
      </div>
    </div>
  );
});

export function HelpDetailContent({ user, helpRequestId }: HelpDetailContentProps) {
  const router = useRouter();
  const [request, setRequest] = useState<HelpRequestDetail | null>(null);
  const [offers, setOffers] = useState<HelpOffer[]>([]);
  const [staffResponses, setStaffResponses] = useState<StaffResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notifying, setNotifying] = useState(false);

  // スタッフ応募フォーム
  const [respondStart, setRespondStart] = useState('');
  const [respondEnd, setRespondEnd] = useState('');
  const [respondMessage, setRespondMessage] = useState('');
  const [responding, setResponding] = useState(false);
  const [respondError, setRespondError] = useState('');
  const [respondSuccess, setRespondSuccess] = useState(false);

  // 店長オファーフォーム
  const [myStaff, setMyStaff] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [offerStart, setOfferStart] = useState('');
  const [offerEnd, setOfferEnd] = useState('');
  const [offering, setOffering] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [offerSuccess, setOfferSuccess] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/help-requests/${helpRequestId}`);
      if (res.ok) {
        const data = await res.json();
        setRequest(data);
        setOffers(data.offers || []);
        setStaffResponses(data.staffResponses || []);
      } else {
        router.push('/dashboard/help-board');
      }
    } catch (error) {
      console.error('ヘルプ要請取得エラー:', error);
      router.push('/dashboard/help-board');
    } finally {
      setLoading(false);
    }
  }, [helpRequestId, router]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // 要請時間をフォームのデフォルト値にセット
  useEffect(() => {
    if (request && !respondStart && !respondEnd) {
      setRespondStart(request.needStart.slice(0, 5));
      setRespondEnd(request.needEnd.slice(0, 5));
    }
    if (request && !offerStart && !offerEnd) {
      setOfferStart(request.needStart.slice(0, 5));
      setOfferEnd(request.needEnd.slice(0, 5));
    }
  }, [request, respondStart, respondEnd, offerStart, offerEnd]);

  // 店長用：自店舗のスタッフ取得
  useEffect(() => {
    if (user.role !== 'staff' && user.storeId && request && user.storeId !== request.storeId) {
      const fetchStaff = async () => {
        try {
          const res = await fetch(`/api/staff?storeId=${user.storeId}`);
          if (res.ok) {
            const data = await res.json();
            // canWorkOtherStoresがtrueのスタッフのみ
            setMyStaff(data.filter((s: { canWorkOtherStores: boolean; role: string }) =>
              s.canWorkOtherStores && s.role === 'staff'
            ).map((s: { id: number; name: string }) => ({ id: s.id, name: s.name })));
          }
        } catch { /* ignore */ }
      };
      fetchStaff();
    }
  }, [user, request]);

  const isCreator = request?.requestedBy === user.id;
  const isAdmin = user.role === 'owner' || user.role === 'manager';
  const isStaff = user.role === 'staff';
  const isOtherStore = user.storeId !== request?.storeId;
  const canEdit =
    isCreator && (request?.status === 'open' || request?.status === 'offered');
  const canWithdraw =
    isCreator && request?.status !== 'confirmed' && request?.status !== 'closed' && request?.status !== 'withdrawn';
  const canNotifyStaff =
    isAdmin && !request?.staffNotified && request?.status !== 'withdrawn' && request?.status !== 'closed' && request?.status !== 'confirmed';

  // スタッフが応募可能か判定（同じ店舗でもOK）
  const canRespond =
    isStaff &&
    (request?.status === 'open' || request?.status === 'offered') &&
    !staffResponses.some(r => r.staffId === user.id && r.status === 'pending');

  const alreadyResponded = staffResponses.some(r => r.staffId === user.id);

  const handleWithdraw = useCallback(async () => {
    if (!confirm('このヘルプ要請を取り下げますか？')) return;
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/help-requests/${helpRequestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'withdrawn' }),
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        const error = await res.json();
        alert(error.error || '取り下げに失敗しました');
      }
    } catch (error) {
      console.error('取り下げエラー:', error);
      alert('取り下げに失敗しました');
    } finally {
      setWithdrawing(false);
    }
  }, [helpRequestId, fetchDetail]);

  const handleConfirmOffer = useCallback(
    async (offerId: number) => {
      if (!confirm('このオファーを確定しますか？シフトが自動登録されます。')) return;
      setConfirming(true);
      try {
        const res = await fetch(`/api/help-requests/${helpRequestId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId }),
        });
        if (res.ok) {
          await fetchDetail();
        } else {
          const error = await res.json();
          alert(error.error || '確定に失敗しました');
        }
      } catch (error) {
        console.error('確定エラー:', error);
        alert('確定に失敗しました');
      } finally {
        setConfirming(false);
      }
    },
    [helpRequestId, fetchDetail]
  );

  const handleConfirmStaffResponse = useCallback(
    async (responseId: number) => {
      if (!confirm('このスタッフの応募を確定しますか？シフトが自動登録されます。')) return;
      setConfirming(true);
      try {
        const res = await fetch(`/api/help-requests/${helpRequestId}/confirm-response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responseId }),
        });
        if (res.ok) {
          await fetchDetail();
        } else {
          const error = await res.json();
          alert(error.error || '確定に失敗しました');
        }
      } catch (error) {
        console.error('確定エラー:', error);
        alert('確定に失敗しました');
      } finally {
        setConfirming(false);
      }
    },
    [helpRequestId, fetchDetail]
  );

  const handleNotifyStaff = useCallback(async () => {
    if (!confirm('条件に合うスタッフにLINE通知を送信しますか？')) return;
    setNotifying(true);
    try {
      const res = await fetch(`/api/help-requests/${helpRequestId}/notify`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        await fetchDetail();
      } else {
        const error = await res.json();
        alert(error.error || '通知に失敗しました');
      }
    } catch (error) {
      console.error('通知エラー:', error);
      alert('通知に失敗しました');
    } finally {
      setNotifying(false);
    }
  }, [helpRequestId, fetchDetail]);

  // 店長がオファーを送信
  const handleOffer = useCallback(async () => {
    setOfferError('');
    setOfferSuccess(false);

    if (!selectedStaffId) {
      setOfferError('スタッフを選択してください');
      return;
    }
    if (!offerStart || !offerEnd) {
      setOfferError('時間帯を選択してください');
      return;
    }
    if (offerStart >= offerEnd) {
      setOfferError('終了時間は開始時間より後にしてください');
      return;
    }

    if (!confirm('このスタッフをヘルプに送りますか？')) return;

    setOffering(true);
    try {
      const needStart = request?.needStart.slice(0, 5) || '';
      const needEnd = request?.needEnd.slice(0, 5) || '';
      const isPartial = offerStart > needStart || offerEnd < needEnd;

      const res = await fetch(`/api/help-requests/${helpRequestId}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: parseInt(selectedStaffId),
          offerStart,
          offerEnd,
          isPartial,
        }),
      });
      if (res.ok) {
        setOfferSuccess(true);
        setSelectedStaffId('');
        await fetchDetail();
      } else {
        const error = await res.json();
        setOfferError(error.error || 'オファーに失敗しました');
      }
    } catch (error) {
      console.error('オファーエラー:', error);
      setOfferError('オファーに失敗しました');
    } finally {
      setOffering(false);
    }
  }, [helpRequestId, selectedStaffId, offerStart, offerEnd, request, fetchDetail]);

  const handleRespond = useCallback(async () => {
    setRespondError('');
    setRespondSuccess(false);

    if (!respondStart || !respondEnd) {
      setRespondError('対応可能な時間帯を選択してください');
      return;
    }
    if (respondStart >= respondEnd) {
      setRespondError('終了時間は開始時間より後にしてください');
      return;
    }

    setResponding(true);
    try {
      const res = await fetch(`/api/help-requests/${helpRequestId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerStart: respondStart,
          offerEnd: respondEnd,
          message: respondMessage || undefined,
        }),
      });
      if (res.ok) {
        setRespondSuccess(true);
        setRespondMessage('');
        await fetchDetail();
      } else {
        const error = await res.json();
        setRespondError(error.error || '応募に失敗しました');
      }
    } catch (error) {
      console.error('応募エラー:', error);
      setRespondError('応募に失敗しました');
    } finally {
      setResponding(false);
    }
  }, [helpRequestId, respondStart, respondEnd, respondMessage, fetchDetail]);

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
      title="ヘルプ要請詳細"
      actions={backButton}
    >
      {loading ? (
        <LoadingSkeleton />
      ) : !request ? (
        <PageSection>
          <div className="text-center py-12">
            <p className="text-[#86868B]">ヘルプ要請が見つかりません</p>
          </div>
        </PageSection>
      ) : (
        <div className="space-y-6">
          {/* 要請情報カード */}
          <PageSection>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <StatusBadge status={request.status} config={statusConfig} />
                  {request.status === 'open' && (
                    <span className="flex items-center gap-1 text-xs text-[#FF3B30] font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      緊急
                    </span>
                  )}
                  {request.staffNotified && (
                    <Badge className="bg-[#007AFF]/10 text-[#007AFF]">
                      <Bell className="w-3 h-3 mr-1" />
                      スタッフ通知済み
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#86868B]" />
                    <span className="text-lg font-semibold text-[#1D1D1F]">
                      {request.storeName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#86868B]" />
                    <span className="text-base text-[#1D1D1F]">
                      {formatDate(request.needDate)}{' '}
                      {formatTimeRange(request.needStart, request.needEnd)}
                    </span>
                  </div>
                  {request.memo && (
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-5 h-5 text-[#86868B] shrink-0 mt-0.5" />
                      <span className="text-base text-[#1D1D1F]">{request.memo}</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#86868B] mt-4">
                  投稿: {getRelativeTime(request.createdAt)}
                </p>
              </div>

              {/* アクションボタン（管理者のみ） */}
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push(`/dashboard/help-board/${helpRequestId}/edit`)
                      }
                      className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      編集
                    </Button>
                  )}
                  {canNotifyStaff && (
                    <Button
                      size="sm"
                      onClick={handleNotifyStaff}
                      disabled={notifying}
                      className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl"
                    >
                      <Bell className="w-4 h-4 mr-1" />
                      {notifying ? '送信中...' : 'スタッフへ通知する'}
                    </Button>
                  )}
                  {canWithdraw && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleWithdraw}
                      disabled={withdrawing}
                      className="rounded-xl border-[#FF3B30]/30 text-[#FF3B30] hover:bg-[#FF3B30]/10"
                    >
                      {withdrawing ? '処理中...' : '取り下げ'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </PageSection>

          {/* 店長オファーフォーム（他店の管理者が自店スタッフを貸し出す） */}
          {isAdmin && isOtherStore && (request?.status === 'open' || request?.status === 'offered') && (
            <PageSection>
              <h3 className="text-lg font-semibold text-[#1D1D1F] mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                スタッフを送る
              </h3>

              {offerSuccess ? (
                <div className="bg-[#34C759]/10 border border-[#34C759]/20 rounded-xl p-4 text-center">
                  <CheckCircle className="w-8 h-8 text-[#34C759] mx-auto mb-2" />
                  <p className="text-[#34C759] font-medium">オファーを送信しました！</p>
                  <p className="text-sm text-[#86868B] mt-1">要請元の店長が確認します</p>
                </div>
              ) : myStaff.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-[#86868B]">他店勤務可能なスタッフがいません</p>
                  <p className="text-xs text-[#86868B] mt-1">スタッフ管理で「他店勤務可」を設定してください</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1D1D1F] mb-1">
                      派遣するスタッフ
                    </label>
                    <select
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                      className="w-full rounded-xl border border-[#E5E5EA] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                    >
                      <option value="">スタッフを選択</option>
                      {myStaff.map((s) => (
                        <option key={s.id} value={s.id.toString()}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#1D1D1F] mb-1">
                      対応可能な時間帯
                    </label>
                    <p className="text-xs text-[#86868B] mb-2">
                      要請時間: {request?.needStart.slice(0, 5)}〜{request?.needEnd.slice(0, 5)}（一部の時間だけでもOK）
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={offerStart}
                        onChange={(e) => setOfferStart(e.target.value)}
                        className="flex-1 rounded-xl border border-[#E5E5EA] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                      >
                        <option value="">開始時間</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="text-[#86868B]">〜</span>
                      <select
                        value={offerEnd}
                        onChange={(e) => setOfferEnd(e.target.value)}
                        className="flex-1 rounded-xl border border-[#E5E5EA] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                      >
                        <option value="">終了時間</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {offerError && (
                    <p className="text-sm text-[#FF3B30]">{offerError}</p>
                  )}

                  <Button
                    onClick={handleOffer}
                    disabled={offering}
                    className="w-full bg-[#FF9500] hover:bg-[#E68600] text-white rounded-xl"
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {offering ? '送信中...' : 'スタッフをオファーする'}
                  </Button>
                </div>
              )}
            </PageSection>
          )}

          {/* スタッフ応募フォーム */}
          {isStaff && (
            <PageSection>
              <h3 className="text-lg font-semibold text-[#1D1D1F] mb-4 flex items-center gap-2">
                <Hand className="w-5 h-5" />
                ヘルプに応募する
              </h3>

              {respondSuccess ? (
                <div className="bg-[#34C759]/10 border border-[#34C759]/20 rounded-xl p-4 text-center">
                  <CheckCircle className="w-8 h-8 text-[#34C759] mx-auto mb-2" />
                  <p className="text-[#34C759] font-medium">応募しました！</p>
                  <p className="text-sm text-[#86868B] mt-1">店長の確認をお待ちください</p>
                </div>
              ) : alreadyResponded ? (
                <div className="bg-[#007AFF]/5 border border-[#007AFF]/20 rounded-xl p-4 text-center">
                  <p className="text-[#007AFF] font-medium">既にこのヘルプ要請に応募済みです</p>
                </div>
              ) : canRespond ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1D1D1F] mb-1">
                      対応可能な時間帯
                    </label>
                    <p className="text-xs text-[#86868B] mb-2">
                      要請時間: {request.needStart.slice(0, 5)}〜{request.needEnd.slice(0, 5)}（一部の時間だけでもOK）
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={respondStart}
                        onChange={(e) => setRespondStart(e.target.value)}
                        className="flex-1 rounded-xl border border-[#E5E5EA] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                      >
                        <option value="">開始時間</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="text-[#86868B]">〜</span>
                      <select
                        value={respondEnd}
                        onChange={(e) => setRespondEnd(e.target.value)}
                        className="flex-1 rounded-xl border border-[#E5E5EA] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                      >
                        <option value="">終了時間</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#1D1D1F] mb-1">
                      メッセージ（任意）
                    </label>
                    <textarea
                      value={respondMessage}
                      onChange={(e) => setRespondMessage(e.target.value)}
                      placeholder="店長への一言（例: 「レジ対応できます」）"
                      maxLength={100}
                      rows={2}
                      className="w-full rounded-xl border border-[#E5E5EA] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF] resize-none"
                    />
                  </div>

                  {respondError && (
                    <p className="text-sm text-[#FF3B30]">{respondError}</p>
                  )}

                  <Button
                    onClick={handleRespond}
                    disabled={responding}
                    className="w-full bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl"
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {responding ? '送信中...' : '応募する'}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-[#86868B]">この要請には現在応募できません</p>
                </div>
              )}
            </PageSection>
          )}

          {/* 店舗オファーセクション */}
          <PageSection>
            <h3 className="text-lg font-semibold text-[#1D1D1F] mb-4">
              店舗からのオファー
              {offers.length > 0 && (
                <span className="ml-2 text-sm font-normal text-[#86868B]">
                  ({offers.length}件)
                </span>
              )}
            </h3>

            {offers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#86868B]">まだ店舗からのオファーはありません</p>
              </div>
            ) : (
              <div className="space-y-3">
                {offers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    isCreator={isCreator}
                    requestStatus={request.status}
                    onConfirm={handleConfirmOffer}
                    confirming={confirming}
                  />
                ))}
              </div>
            )}
          </PageSection>

          {/* スタッフ直接応募セクション */}
          {staffResponses.length > 0 && (
            <PageSection>
              <h3 className="text-lg font-semibold text-[#1D1D1F] mb-4">
                スタッフからの応募
                <span className="ml-2 text-sm font-normal text-[#86868B]">
                  ({staffResponses.length}件)
                </span>
              </h3>

              <div className="space-y-3">
                {staffResponses.map((response) => (
                  <StaffResponseCard
                    key={response.id}
                    response={response}
                    isAdmin={isAdmin}
                    requestStatus={request.status}
                    onConfirm={handleConfirmStaffResponse}
                    confirming={confirming}
                  />
                ))}
              </div>
            </PageSection>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
