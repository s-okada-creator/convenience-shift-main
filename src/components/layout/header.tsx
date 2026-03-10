'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { SessionUser } from '@/lib/auth';

interface HeaderProps {
  user: SessionUser;
}

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: '店長',
  staff: 'スタッフ',
};

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', roles: ['owner', 'manager', 'staff'] },
  { href: '/dashboard/staff', label: 'スタッフ管理', roles: ['owner', 'manager'] },
  { href: '/dashboard/shifts', label: 'シフト作成', roles: ['owner', 'manager'] },
  { href: '/dashboard/my-shifts', label: 'マイシフト', roles: ['owner', 'manager', 'staff'] },
];

export function Header({ user }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role));

  return (
    <header className="bg-white border-b border-[#D2D2D7] px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-semibold text-[#1D1D1F]">シフト管理</h1>
          <nav className="flex items-center gap-1">
            {filteredNavItems.map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                onClick={() => router.push(item.href)}
                className={`text-sm ${
                  pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                    ? 'bg-[#F5F5F7] text-[#1D1D1F]'
                    : 'text-[#86868B] hover:text-[#1D1D1F]'
                }`}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-[#1D1D1F]">{user.name}</p>
            <p className="text-xs text-[#86868B]">{roleLabels[user.role]}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-[#D2D2D7]"
          >
            ログアウト
          </Button>
        </div>
      </div>
    </header>
  );
}
