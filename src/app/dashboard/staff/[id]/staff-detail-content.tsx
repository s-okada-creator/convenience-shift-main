'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Save,
  Trash2,
  User,
  Clock,
  AlertCircle,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { AvailabilityEditor } from '@/components/staff/availability-editor';

interface Store {
  id: number;
  name: string;
}

interface AvailabilityPattern {
  id: number;
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
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
  availabilityPatterns: AvailabilityPattern[];
}

interface StaffDetailContentProps {
  user: SessionUser;
  staffId: number;
}

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: '店長',
  staff: 'スタッフ',
};

// ローディングスケルトン
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-[#E5E5EA] rounded-xl w-48" />
      <div className="grid grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-[#E5E5EA] rounded-xl" />
        ))}
      </div>
    </div>
  );
});

// エラー表示
const ErrorState = memo(function ErrorState({
  error,
  onBack,
}: {
  error: string;
  onBack: () => void;
}) {
  return (
    <PageSection>
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 rounded-full bg-[#FF3B30]/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-[#FF3B30]" />
        </div>
        <p className="text-[#FF3B30] mb-4">{error}</p>
        <Button
          onClick={onBack}
          className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          スタッフ一覧に戻る
        </Button>
      </div>
    </PageSection>
  );
});

export function StaffDetailContent({ user, staffId }: StaffDetailContentProps) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [staffData, setStaffData] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    employmentType: 'part_time' as 'employee' | 'part_time',
    hourlyRate: 1100,
    joinedAt: '',
    skillLevel: 1,
    notes: '',
    role: 'staff' as 'owner' | 'manager' | 'staff',
    storeId: 0,
  });

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

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setStaffData(data);
        setFormData({
          name: data.name,
          email: data.email || '',
          phone: data.phone || '',
          employmentType: data.employmentType,
          hourlyRate: data.hourlyRate,
          joinedAt: data.joinedAt,
          skillLevel: data.skillLevel || 1,
          notes: data.notes || '',
          role: data.role,
          storeId: data.storeId,
        });
      } else {
        setError('スタッフが見つかりません');
      }
    } catch (error) {
      console.error('スタッフ取得エラー:', error);
      setError('スタッフの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    fetchStores();
    fetchStaff();
  }, [fetchStores, fetchStaff]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const updatedStaff = await res.json();
        setStaffData({ ...staffData!, ...updatedStaff });
        alert('保存しました');
      } else {
        const errorData = await res.json();
        setError(errorData.error || '保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [staffId, formData, staffData]);

  const handleDelete = useCallback(async () => {
    if (!confirm('このスタッフを削除してもよろしいですか？この操作は取り消せません。')) {
      return;
    }

    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/dashboard/staff');
      } else {
        const errorData = await res.json();
        setError(errorData.error || '削除に失敗しました');
      }
    } catch (error) {
      console.error('削除エラー:', error);
      setError('削除に失敗しました');
    }
  }, [staffId, router]);

  const handleBack = useCallback(() => {
    router.push('/dashboard/staff');
  }, [router]);

  const handleFormChange = useCallback((field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const storeName = useMemo(() => {
    const store = stores.find((s) => s.id === staffData?.storeId);
    return store?.name || '';
  }, [stores, staffData]);

  const backButton = useMemo(() => (
    <Button
      variant="outline"
      onClick={handleBack}
      className="rounded-xl border-[#E5E5EA] hover:bg-[#F5F5F7]"
    >
      <ArrowLeft className="w-4 h-4 mr-2" />
      スタッフ一覧
    </Button>
  ), [handleBack]);

  const titleContent = useMemo(() => {
    if (!staffData) return 'スタッフ詳細';
    return (
      <div className="flex items-center gap-3">
        <span>{staffData.name}</span>
        <Badge
          className={`border-0 ${
            staffData.role === 'owner'
              ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
              : staffData.role === 'manager'
              ? 'bg-[#007AFF]/10 text-[#007AFF]'
              : 'bg-[#F5F5F7] text-[#86868B]'
          }`}
        >
          {roleLabels[staffData.role]}
        </Badge>
      </div>
    );
  }, [staffData]);

  if (loading) {
    return (
      <DashboardLayout
        user={user}
        title="スタッフ詳細"
        description="読み込み中..."
        actions={backButton}
      >
        <PageSection>
          <LoadingSkeleton />
        </PageSection>
      </DashboardLayout>
    );
  }

  if (error && !staffData) {
    return (
      <DashboardLayout
        user={user}
        title="スタッフ詳細"
        description="エラーが発生しました"
        actions={backButton}
      >
        <ErrorState error={error} onBack={handleBack} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      user={user}
      title={titleContent}
      description={storeName}
      actions={backButton}
    >
      {error && (
        <div className="mb-4 p-4 bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-xl">
          <p className="text-[#FF3B30] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        </div>
      )}

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList className="bg-[#F5F5F7] p-1 rounded-xl">
          <TabsTrigger
            value="info"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <User className="w-4 h-4 mr-2" />
            基本情報
          </TabsTrigger>
          <TabsTrigger
            value="availability"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Clock className="w-4 h-4 mr-2" />
            勤務可能時間
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <PageSection>
            <h2 className="text-lg font-semibold text-[#1D1D1F] mb-6">基本情報</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[#86868B]">名前</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="border-[#E5E5EA] focus:border-[#007AFF]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeId" className="text-[#86868B]">店舗</Label>
                  <Select
                    value={formData.storeId.toString()}
                    onValueChange={(value) => handleFormChange('storeId', parseInt(value))}
                    disabled={user.role !== 'owner'}
                  >
                    <SelectTrigger className="border-[#E5E5EA]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id.toString()}>
                          {store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#86868B]">メールアドレス</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                    className="border-[#E5E5EA] focus:border-[#007AFF]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-[#86868B]">電話番号</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value)}
                    className="border-[#E5E5EA] focus:border-[#007AFF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employmentType" className="text-[#86868B]">雇用形態</Label>
                  <Select
                    value={formData.employmentType}
                    onValueChange={(value) => handleFormChange('employmentType', value)}
                  >
                    <SelectTrigger className="border-[#E5E5EA]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">社員</SelectItem>
                      <SelectItem value="part_time">アルバイト</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-[#86868B]">役職</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => handleFormChange('role', value)}
                    disabled={user.role !== 'owner'}
                  >
                    <SelectTrigger className="border-[#E5E5EA]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {user.role === 'owner' && (
                        <>
                          <SelectItem value="owner">オーナー</SelectItem>
                          <SelectItem value="manager">店長</SelectItem>
                        </>
                      )}
                      <SelectItem value="staff">スタッフ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hourlyRate" className="text-[#86868B]">時給（円）</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    value={formData.hourlyRate}
                    onChange={(e) => handleFormChange('hourlyRate', parseInt(e.target.value) || 0)}
                    className="border-[#E5E5EA] focus:border-[#007AFF]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skillLevel" className="text-[#86868B]">スキルレベル</Label>
                  <Select
                    value={formData.skillLevel.toString()}
                    onValueChange={(value) => handleFormChange('skillLevel', parseInt(value))}
                  >
                    <SelectTrigger className="border-[#E5E5EA]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((level) => (
                        <SelectItem key={level} value={level.toString()}>
                          Lv.{level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="joinedAt" className="text-[#86868B]">入社日</Label>
                  <Input
                    id="joinedAt"
                    type="date"
                    value={formData.joinedAt}
                    onChange={(e) => handleFormChange('joinedAt', e.target.value)}
                    className="border-[#E5E5EA] focus:border-[#007AFF]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-[#86868B]">備考</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                  placeholder="学生、主婦など"
                  className="border-[#E5E5EA] focus:border-[#007AFF]"
                />
              </div>

              <div className="flex justify-between pt-4 border-t border-[#E5E5EA]">
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-[#FF3B30] hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] border-[#E5E5EA]"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  削除
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </PageSection>
        </TabsContent>

        <TabsContent value="availability">
          <AvailabilityEditor
            staffId={staffId}
            initialPatterns={staffData?.availabilityPatterns || []}
          />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
