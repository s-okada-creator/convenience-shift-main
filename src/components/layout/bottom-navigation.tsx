'use client';

import { memo, useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Users, ClipboardList, Megaphone, HandHeart, Menu, X, LogOut, Plus } from 'lucide-react';
import type { SessionUser } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
}

const primaryNavItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'ホーム',
    icon: Home,
    roles: ['owner', 'manager'],
  },
  {
    href: '/dashboard/shifts',
    label: 'シフト',
    icon: Calendar,
    roles: ['owner', 'manager'],
  },
  {
    href: '/dashboard/help-board',
    label: 'ヘルプ',
    icon: Megaphone,
    roles: ['owner', 'manager'],
  },
];

const menuItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'ダッシュボード',
    icon: Home,
    roles: ['owner', 'manager', 'staff'],
  },
  {
    href: '/dashboard/shifts',
    label: 'シフト作成',
    icon: Calendar,
    roles: ['owner', 'manager'],
  },
  {
    href: '/dashboard/help-board',
    label: 'ヘルプボード',
    icon: Megaphone,
    roles: ['owner', 'manager', 'staff'],
  },
  {
    href: '/dashboard/staff',
    label: 'スタッフ管理',
    icon: Users,
    roles: ['owner', 'manager'],
  },
  {
    href: '/dashboard/requirements',
    label: '必要人数設定',
    icon: ClipboardList,
    roles: ['owner', 'manager'],
  },
];

export const BottomNavigation = memo(function BottomNavigation({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openHelpCount, setOpenHelpCount] = useState(0);

  useEffect(() => {
    const fetchHelpCount = async () => {
      try {
        const res = await fetch('/api/help-requests?status=open');
        if (res.ok) {
          const data = await res.json();
          setOpenHelpCount(data.length);
        }
      } catch { /* ignore */ }
    };
    fetchHelpCount();
    const interval = setInterval(fetchHelpCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredPrimaryItems = useMemo(
    () => primaryNavItems.filter((item) => item.roles.includes(user.role)),
    [user.role]
  );

  const filteredMenuItems = useMemo(
    () => menuItems.filter((item) => item.roles.includes(user.role)),
    [user.role]
  );

  const isActiveLink = useCallback(
    (href: string) => {
      if (href === '/dashboard') {
        return pathname === '/dashboard';
      }
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const handleLogout = useCallback(async () => {
    const confirmed = window.confirm('ログアウトしますか？');
    if (!confirmed) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E5EA] bg-white/80 backdrop-blur-xl pb-safe">
        <nav className="grid grid-cols-5 h-16 px-2">
          {filteredPrimaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveLink(item.href);
            const showBadge = item.href === '/dashboard/help-board' && openHelpCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`touch-target flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors relative ${
                  active ? 'text-[#007AFF]' : 'text-[#86868B]'
                }`}
              >
                <div className="relative">
                  <Icon className={`h-5 w-5 ${active ? 'text-[#007AFF]' : 'text-[#86868B]'}`} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 bg-[#FF3B30] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {openHelpCount}
                    </span>
                  )}
                </div>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="touch-target flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-[#86868B]"
          >
            <Menu className="h-5 w-5" />
            メニュー
          </button>
        </nav>
      </div>

      {menuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={closeMenu}
        />
      )}

      <div
        className={`lg:hidden fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
          menuOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="rounded-t-2xl bg-white p-4 pb-safe shadow-[0_-12px_30px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1D1D1F]">メニュー</h3>
            <button
              type="button"
              onClick={closeMenu}
              className="touch-target flex items-center justify-center rounded-full border border-[#E5E5EA] bg-white p-2"
            >
              <X className="h-4 w-4 text-[#86868B]" />
            </button>
          </div>
          <div className="mt-4 space-y-1">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveLink(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={closeMenu}
                  className={`touch-target flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#007AFF]/10 text-[#007AFF]'
                      : 'text-[#1D1D1F] hover:bg-[#F5F5F7]'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'text-[#007AFF]' : 'text-[#86868B]'}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
          {/* 緊急求人ボタン（管理者のみ） */}
          {(user.role === 'owner' || user.role === 'manager') && (
            <div className="mt-4">
              <Link
                href="/dashboard/help-board/create"
                onClick={closeMenu}
                className="flex items-center gap-3 w-full px-4 py-3 bg-gradient-to-r from-[#FF3B30] to-[#FF453A] text-white rounded-xl"
              >
                <Plus className="h-5 w-5" />
                <div>
                  <p className="text-sm font-bold">緊急ヘルプ求人</p>
                  <p className="text-[10px] opacity-80">人手が足りない時はこちら</p>
                </div>
              </Link>
            </div>
          )}

          {/* 追加で働きたいボタン（全ロール） */}
          <div className="mt-2">
            <Link
              href="/dashboard/extra-shifts"
              onClick={closeMenu}
              className="flex items-center gap-3 w-full px-4 py-3 bg-gradient-to-r from-[#34C759] to-[#30D158] text-white rounded-xl"
            >
              <HandHeart className="h-5 w-5" />
              <div>
                <p className="text-sm font-bold">追加勤務募集</p>
                <p className="text-[10px] opacity-80">募集を見る・応募する</p>
              </div>
            </Link>
          </div>

          <div className="mt-4 border-t border-[#E5E5EA] pt-3">
            <button
              type="button"
              onClick={() => {
                closeMenu();
                void handleLogout();
              }}
              className="touch-target flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#FF3B30] hover:bg-[#FF3B30]/10"
            >
              <LogOut className="h-4 w-4" />
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </>
  );
});
