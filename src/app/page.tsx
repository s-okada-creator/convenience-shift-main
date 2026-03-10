'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type DemoUserKey = 'owner' | 'manager1' | 'manager2' | 'manager3' | 'staff1';

interface DemoUser {
  key: DemoUserKey;
  name: string;
  role: string;
  store: string;
}

const demoUsers: DemoUser[] = [
  { key: 'owner', name: '山田太郎', role: 'オーナー', store: '全店舗' },
  { key: 'manager1', name: '佐藤花子', role: '店長', store: '渋谷店' },
  { key: 'manager2', name: '鈴木一郎', role: '店長', store: '新宿店' },
  { key: 'manager3', name: '高橋美咲', role: '店長', store: '池袋店' },
  { key: 'staff1', name: '田中健太', role: 'スタッフ', store: '渋谷店' },
];

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<DemoUserKey | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (userKey: DemoUserKey) => {
    setIsLoading(userKey);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey }),
      });

      if (response.ok) {
        router.push('/dashboard');
        return;
      }

      const data = await response.json().catch(() => null);
      setErrorMessage(data?.error || 'ログインに失敗しました');
    } catch (error) {
      console.error('Login failed:', error);
      setErrorMessage('ログインに失敗しました');
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-semibold text-[#1D1D1F]">
            シフト管理
          </CardTitle>
          <CardDescription className="text-[#86868B]">
            コンビニエンスストア 複数店舗管理システム
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {errorMessage && (
            <p className="text-sm text-center text-[#FF3B30]">
              {errorMessage}
            </p>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#1D1D1F]">管理者としてログイン</p>
            <div className="space-y-2">
              {demoUsers.filter(u => u.role !== 'スタッフ').map((user) => (
                <Button
                  key={user.key}
                  variant="outline"
                  className="w-full h-auto py-3 px-4 justify-start hover:bg-[#E8E8ED] border-[#D2D2D7]"
                  onClick={() => handleLogin(user.key)}
                  disabled={isLoading !== null}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-[#1D1D1F]">{user.name}</span>
                    <span className="text-xs text-[#86868B]">
                      {user.role} · {user.store}
                    </span>
                  </div>
                  {isLoading === user.key && (
                    <span className="ml-auto text-[#007AFF]">ログイン中...</span>
                  )}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#D2D2D7] pt-4 space-y-2">
            <p className="text-sm font-medium text-[#1D1D1F]">スタッフとしてログイン</p>
            {demoUsers.filter(u => u.role === 'スタッフ').map((user) => (
              <Button
                key={user.key}
                variant="outline"
                className="w-full h-auto py-3 px-4 justify-start hover:bg-[#E8E8ED] border-[#D2D2D7]"
                onClick={() => handleLogin(user.key)}
                disabled={isLoading !== null}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium text-[#1D1D1F]">{user.name}</span>
                  <span className="text-xs text-[#86868B]">
                    {user.role} · {user.store}
                  </span>
                </div>
                {isLoading === user.key && (
                  <span className="ml-auto text-[#007AFF]">ログイン中...</span>
                )}
              </Button>
            ))}
          </div>

          <p className="text-xs text-center text-[#86868B] pt-2">
            デモ用アカウントです。実際の認証は行いません。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
