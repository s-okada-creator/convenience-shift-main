'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  UserPlus,
  ChevronRight,
  Users,
  Briefcase,
  Star,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface Store {
  id: number;
  name: string;
}

interface Staff {
  id: number;
  storeId: number;
  name: string;
  email: string | null;
  phone: string | null;
  employmentType: 'employee' | 'part_time';
  hourlyRate: number;
  joinedAt: string;
  skillLevel: number | null;
  notes: string | null;
  role: 'owner' | 'manager' | 'staff';
  createdAt: string;
}

interface StaffListContentProps {
  user: SessionUser;
}

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: '店長',
  staff: 'スタッフ',
};

const employmentTypeLabels: Record<string, string> = {
  employee: '社員',
  part_time: 'アルバイト',
};

// ローディングスケルトン
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-[#E5E5EA] rounded-xl" />
      ))}
    </div>
  );
});

// 空状態
const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-16 h-16 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-[#D2D2D7]" />
      </div>
      <p className="text-[#86868B]">スタッフが登録されていません</p>
    </div>
  );
});

// スキルレベルバッジ
const SkillLevelBadge = memo(function SkillLevelBadge({ level }: { level: number | null }) {
  if (!level) return <span className="text-[#D2D2D7]">—</span>;

  const colors: Record<number, string> = {
    1: 'bg-[#F5F5F7] text-[#86868B]',
    2: 'bg-[#007AFF]/10 text-[#007AFF]',
    3: 'bg-[#34C759]/10 text-[#34C759]',
    4: 'bg-[#FF9500]/10 text-[#FF9500]',
    5: 'bg-[#FF3B30]/10 text-[#FF3B30]',
  };

  return (
    <Badge className={`${colors[level] || colors[1]} border-0`}>
      <Star className="w-3 h-3 mr-1" />
      Lv.{level}
    </Badge>
  );
});

// スタッフ行
const StaffRow = memo(function StaffRow({
  staff,
  storeName,
  showStore,
  onDetail,
}: {
  staff: Staff;
  storeName: string;
  showStore: boolean;
  onDetail: () => void;
}) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-[#F5F5F7] transition-colors"
      onClick={onDetail}
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center text-white font-medium text-sm">
            {staff.name.charAt(0)}
          </div>
          <div>
            <p className="text-[#1D1D1F] font-medium">{staff.name}</p>
            {staff.notes && (
              <p className="text-xs text-[#86868B] truncate max-w-[200px]">{staff.notes}</p>
            )}
          </div>
        </div>
      </TableCell>
      {showStore && <TableCell className="text-[#86868B]">{storeName}</TableCell>}
      <TableCell>
        <Badge
          className={`border-0 ${
            staff.role === 'owner'
              ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
              : staff.role === 'manager'
              ? 'bg-[#007AFF]/10 text-[#007AFF]'
              : 'bg-[#F5F5F7] text-[#86868B]'
          }`}
        >
          {roleLabels[staff.role]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={`border-0 ${
            staff.employmentType === 'employee'
              ? 'bg-[#34C759]/10 text-[#34C759]'
              : 'bg-[#FF9500]/10 text-[#FF9500]'
          }`}
        >
          <Briefcase className="w-3 h-3 mr-1" />
          {employmentTypeLabels[staff.employmentType]}
        </Badge>
      </TableCell>
      <TableCell className="text-[#1D1D1F] font-medium">
        ¥{staff.hourlyRate.toLocaleString()}
      </TableCell>
      <TableCell>
        <SkillLevelBadge level={staff.skillLevel} />
      </TableCell>
      <TableCell className="text-[#86868B]">{staff.joinedAt}</TableCell>
      <TableCell className="text-right">
        <ChevronRight className="w-5 h-5 text-[#D2D2D7]" />
      </TableCell>
    </TableRow>
  );
});

export function StaffListContent({ user }: StaffListContentProps) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data);
        if (user.role === 'manager' && user.storeId) {
          setSelectedStoreId(user.storeId.toString());
        }
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  }, [user.role, user.storeId]);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/staff';
      if (selectedStoreId && selectedStoreId !== 'all') {
        url += `?storeId=${selectedStoreId}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setStaffList(data);
      }
    } catch (error) {
      console.error('スタッフ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const getStoreName = useCallback((storeId: number) => {
    const store = stores.find((s) => s.id === storeId);
    return store?.name || '不明';
  }, [stores]);

  const handleStoreChange = useCallback((value: string) => {
    setSelectedStoreId(value);
  }, []);

  const handleAddStaff = useCallback(() => {
    router.push('/dashboard/staff/new');
  }, [router]);

  const handleStaffDetail = useCallback((staffId: number) => {
    router.push(`/dashboard/staff/${staffId}`);
  }, [router]);

  const storeSelector = useMemo(() => {
    if (user.role !== 'owner') return null;
    return (
      <Select value={selectedStoreId} onValueChange={handleStoreChange}>
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
    );
  }, [user.role, selectedStoreId, stores, handleStoreChange]);

  const addButton = useMemo(() => (
    <Button
      onClick={handleAddStaff}
      className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl"
    >
      <UserPlus className="w-4 h-4 mr-2" />
      スタッフを追加
    </Button>
  ), [handleAddStaff]);

  const actions = useMemo(() => (
    <div className="flex items-center gap-3">
      {storeSelector}
      {addButton}
    </div>
  ), [storeSelector, addButton]);

  return (
    <DashboardLayout
      user={user}
      title="スタッフ管理"
      description="スタッフ情報の確認・編集"
      actions={actions}
    >
      <PageSection>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#1D1D1F] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#007AFF]" />
            スタッフ一覧
            <span className="text-sm font-normal text-[#86868B]">
              ({staffList.length}名)
            </span>
          </h2>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : staffList.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E5E5EA]">
                  <TableHead className="w-[250px] text-[#86868B]">名前</TableHead>
                  {user.role === 'owner' && <TableHead className="text-[#86868B]">店舗</TableHead>}
                  <TableHead className="text-[#86868B]">役職</TableHead>
                  <TableHead className="text-[#86868B]">雇用形態</TableHead>
                  <TableHead className="text-[#86868B]">時給</TableHead>
                  <TableHead className="text-[#86868B]">スキル</TableHead>
                  <TableHead className="text-[#86868B]">入社日</TableHead>
                  <TableHead className="text-right text-[#86868B]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffList.map((s) => (
                  <StaffRow
                    key={s.id}
                    staff={s}
                    storeName={getStoreName(s.storeId)}
                    showStore={user.role === 'owner'}
                    onDetail={() => handleStaffDetail(s.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>
    </DashboardLayout>
  );
}
