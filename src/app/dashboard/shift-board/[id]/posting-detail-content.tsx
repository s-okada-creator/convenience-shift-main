'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  Users,
  FileText,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Briefcase,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SessionUser } from '@/lib/auth';

interface Application {
  id: number;
  userId: number;
  userName: string;
  userStoreName: string | null;
  message: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
}

interface PostingDetail {
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
  applications: Application[];
  myApplication?: {
    id: number;
    status: 'pending' | 'confirmed' | 'rejected';
    message: string | null;
  } | null;
}

const STATUS_CONFIG = {
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

export function PostingDetailContent({
  user,
  postingId,
}: {
  user: SessionUser;
  postingId: string;
}) {
  const router = useRouter();
  const [posting, setPosting] = useState<PostingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [closingLoading, setClosingLoading] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);

  const isManager = user.role === 'owner' || user.role === 'manager';

  const fetchPosting = useCallback(async () => {
    try {
      const res = await fetch(`/api/shift-postings/${postingId}`);
      if (res.ok) {
        const data = await res.json();
        setPosting(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [postingId]);

  useEffect(() => {
    fetchPosting();
  }, [fetchPosting]);

  const handleConfirm = async (applicationId: number) => {
    setActionLoading(applicationId);
    try {
      const res = await fetch(`/api/shift-postings/${postingId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      if (res.ok) {
        fetchPosting();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (applicationId: number) => {
    setActionLoading(applicationId);
    try {
      const res = await fetch(`/api/shift-postings/${postingId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, action: 'reject' }),
      });
      if (res.ok) {
        fetchPosting();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    if (!confirm('この求人をクローズしますか？')) return;
    setClosingLoading(true);
    try {
      const res = await fetch(`/api/shift-postings/${postingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      if (res.ok) {
        fetchPosting();
      }
    } catch {
      // ignore
    } finally {
      setClosingLoading(false);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplying(true);
    try {
      const res = await fetch(`/api/shift-postings/${postingId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: applyMessage.trim() || null }),
      });
      if (res.ok) {
        setApplyMessage('');
        fetchPosting();
      }
    } catch {
      // ignore
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout user={user}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#86868B] animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!posting) {
    return (
      <DashboardLayout user={user}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-[#F5F5F7] rounded-2xl flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-[#86868B]" />
          </div>
          <p className="text-sm text-[#86868B] mb-4">求人が見つかりません</p>
          <Link href="/dashboard/shift-board">
            <Button variant="outline" className="rounded-xl">
              一覧に戻る
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const statusConf = STATUS_CONFIG[posting.status];
  const slotsRemaining = posting.slotsTotal - posting.slotsFilled;
  const hasApplied = posting.myApplication != null;

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
          <span>求人詳細</span>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto space-y-4">
        {/* 求人情報カード */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-5 sm:p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1D1D1F]">{posting.storeName}</h2>
            <Badge className={`${statusConf.bgColor} ${statusConf.textColor} border-0 text-xs font-medium`}>
              {statusConf.label}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-[#1D1D1F]">
              <CalendarDays className="w-5 h-5 text-[#86868B] shrink-0" />
              <span>
                {formatDate(posting.date)} {formatTime(posting.startTime)}〜{formatTime(posting.endTime)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-[#1D1D1F]">
              <Users className="w-5 h-5 text-[#86868B] shrink-0" />
              <span>
                残り
                <span className={`font-semibold ${slotsRemaining > 0 ? 'text-[#FF9500]' : 'text-[#86868B]'}`}>
                  {slotsRemaining}枠
                </span>
                （{posting.slotsFilled}/{posting.slotsTotal}名確定）
              </span>
            </div>
            {posting.description && (
              <div className="flex items-start gap-3 text-sm text-[#86868B]">
                <FileText className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{posting.description}</span>
              </div>
            )}
          </div>

          {/* 店長向け: クローズボタン */}
          {isManager && posting.status === 'open' && (
            <div className="mt-5 pt-4 border-t border-[#F5F5F7]">
              <Button
                onClick={handleClose}
                disabled={closingLoading}
                variant="outline"
                className="rounded-xl text-[#FF3B30] border-[#FF3B30]/30 hover:bg-[#FF3B30]/5 gap-2"
              >
                {closingLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                この求人をクローズ
              </Button>
            </div>
          )}
        </div>

        {/* 店長向け: 応募者一覧 */}
        {isManager && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-5 sm:p-6">
            <h3 className="text-base font-semibold text-[#1D1D1F] mb-4">
              応募者一覧（{posting.applications.length}件）
            </h3>

            {posting.applications.length === 0 ? (
              <p className="text-sm text-[#86868B] text-center py-6">
                まだ応募はありません
              </p>
            ) : (
              <div className="space-y-3">
                {posting.applications.map((app) => (
                  <div
                    key={app.id}
                    className="border border-[#E5E5EA] rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-[#1D1D1F]">
                          {app.userName}
                        </span>
                        {app.userStoreName && (
                          <span className="text-xs text-[#86868B] ml-2">
                            （{app.userStoreName}）
                          </span>
                        )}
                      </div>
                      <Badge
                        className={`text-xs border-0 font-medium ${
                          app.status === 'confirmed'
                            ? 'bg-[#34C759]/10 text-[#34C759]'
                            : app.status === 'rejected'
                            ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                            : 'bg-[#FF9500]/10 text-[#FF9500]'
                        }`}
                      >
                        {app.status === 'confirmed'
                          ? '確定'
                          : app.status === 'rejected'
                          ? '見送り'
                          : '審査中'}
                      </Badge>
                    </div>

                    {app.message && (
                      <div className="flex items-start gap-2 mb-3">
                        <MessageCircle className="w-4 h-4 text-[#86868B] shrink-0 mt-0.5" />
                        <p className="text-sm text-[#86868B]">{app.message}</p>
                      </div>
                    )}

                    {app.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleConfirm(app.id)}
                          disabled={actionLoading === app.id}
                          size="sm"
                          className="bg-[#34C759] hover:bg-[#30D158] text-white rounded-xl gap-1.5"
                        >
                          {actionLoading === app.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          確定
                        </Button>
                        <Button
                          onClick={() => handleReject(app.id)}
                          disabled={actionLoading === app.id}
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-[#FF3B30] border-[#FF3B30]/30 hover:bg-[#FF3B30]/5 gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          見送り
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* スタッフ向け: 応募フォーム or 応募済み表示 */}
        {!isManager && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-5 sm:p-6">
            {hasApplied ? (
              <div className="text-center py-4">
                <Badge
                  className={`text-sm font-medium border-0 px-4 py-1.5 ${
                    posting.myApplication?.status === 'confirmed'
                      ? 'bg-[#34C759]/10 text-[#34C759]'
                      : posting.myApplication?.status === 'rejected'
                      ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                      : 'bg-[#FF9500]/10 text-[#FF9500]'
                  }`}
                >
                  {posting.myApplication?.status === 'confirmed'
                    ? '応募が確定されました'
                    : posting.myApplication?.status === 'rejected'
                    ? '見送りとなりました'
                    : '応募済み（審査中）'}
                </Badge>
                {posting.myApplication?.message && (
                  <p className="text-xs text-[#86868B] mt-3">
                    あなたのメッセージ: {posting.myApplication.message}
                  </p>
                )}
              </div>
            ) : posting.status === 'open' && slotsRemaining > 0 ? (
              <form onSubmit={handleApplySubmit}>
                <h3 className="text-base font-semibold text-[#1D1D1F] mb-3">
                  この求人に応募する
                </h3>
                <div className="mb-3">
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
                <Button
                  type="submit"
                  disabled={applying}
                  className="w-full bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl h-11 text-sm font-semibold gap-2"
                >
                  {applying && <Loader2 className="w-4 h-4 animate-spin" />}
                  応募する
                </Button>
              </form>
            ) : (
              <p className="text-center text-sm text-[#86868B] py-4">
                この求人は現在応募を受け付けていません
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
