'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, PageSection } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  UserPlus,
  AlertCircle,
} from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface Store {
  id: number;
  name: string;
}

interface NewStaffContentProps {
  user: SessionUser;
}

export function NewStaffContent({ user }: NewStaffContentProps) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    employmentType: 'part_time' as 'employee' | 'part_time',
    hourlyRate: 1100,
    joinedAt: new Date().toISOString().split('T')[0],
    skillLevel: 1,
    notes: '',
    role: 'staff' as 'owner' | 'manager' | 'staff',
    storeId: user.storeId || 0,
  });

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data);
        if (user.role === 'manager' && user.storeId) {
          setFormData((prev) => ({ ...prev, storeId: user.storeId! }));
        } else if (data.length > 0 && !formData.storeId) {
          setFormData((prev) => ({ ...prev, storeId: data[0].id }));
        }
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  }, [user.role, user.storeId, formData.storeId]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const handleSave = useCallback(async () => {
    if (!formData.name) {
      setError('名前は必須です');
      return;
    }
    if (!formData.storeId) {
      setError('店舗を選択してください');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const newStaff = await res.json();
        router.push(`/dashboard/staff/${newStaff.id}`);
      } else {
        const errorData = await res.json();
        setError(errorData.error || '作成に失敗しました');
      }
    } catch (error) {
      console.error('作成エラー:', error);
      setError('作成に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [formData, router]);

  const handleBack = useCallback(() => {
    router.push('/dashboard/staff');
  }, [router]);

  const handleFormChange = useCallback((field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

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

  return (
    <DashboardLayout
      user={user}
      title="新規スタッフ登録"
      description="新しいスタッフの情報を入力"
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

      <PageSection>
        <h2 className="text-lg font-semibold text-[#1D1D1F] mb-6">基本情報</h2>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#86868B]">
                名前 <span className="text-[#FF3B30]">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                placeholder="山田太郎"
                className="border-[#E5E5EA] focus:border-[#007AFF]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeId" className="text-[#86868B]">
                店舗 <span className="text-[#FF3B30]">*</span>
              </Label>
              <Select
                value={formData.storeId.toString()}
                onValueChange={(value) => handleFormChange('storeId', parseInt(value))}
                disabled={user.role !== 'owner'}
              >
                <SelectTrigger className="border-[#E5E5EA]">
                  <SelectValue placeholder="店舗を選択" />
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
                placeholder="example@mail.com"
                className="border-[#E5E5EA] focus:border-[#007AFF]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-[#86868B]">電話番号</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleFormChange('phone', e.target.value)}
                placeholder="090-1234-5678"
                className="border-[#E5E5EA] focus:border-[#007AFF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employmentType" className="text-[#86868B]">
                雇用形態 <span className="text-[#FF3B30]">*</span>
              </Label>
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
              <Label htmlFor="hourlyRate" className="text-[#86868B]">
                時給（円） <span className="text-[#FF3B30]">*</span>
              </Label>
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
              <Label htmlFor="joinedAt" className="text-[#86868B]">
                入社日 <span className="text-[#FF3B30]">*</span>
              </Label>
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

          <div className="flex justify-end gap-3 pt-4 border-t border-[#E5E5EA]">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={saving}
              className="border-[#E5E5EA]"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#007AFF] hover:bg-[#0056b3] text-white rounded-xl"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {saving ? '作成中...' : 'スタッフを作成'}
            </Button>
          </div>
        </div>
      </PageSection>
    </DashboardLayout>
  );
}
