'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, CalendarDays, CalendarOff, Users, ClipboardList, Menu, X, LogOut } from 'lucide-react';
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
    label: 'ダッシュボード',
    icon: Home,
    roles: ['owner', 'manager', 'staff'],
  },
  {
    href: '/dashboard/shifts',
    label: 'シフト',
    icon: Calendar,
    roles: ['owner', 'manager', 'staff'],
  },
  {
    href: '/dashboard/my-shifts',
    label: 'マイシフト',
    icon: CalendarDays,
    roles: ['owner', 'manager', 'staff'],
  },
  {
    href: '/dashboard/time-off',
    label: '休み希望',
    icon: CalendarOff,
    roles: ['owner', 'manager', 'staff'],
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
  {
    href: '/dashboard/my-shifts',
    label: 'マイシフト',
    icon: CalendarDays,
    roles: ['owner', 'manager', 'staff'],
  },
  {
    href: '/dashboard/time-off',
    label: '休み希望',
    icon: CalendarOff,
    roles: ['owner', 'manager', 'staff'],
  },
];

export const BottomNavigation = memo(function BottomNavigation({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`touch-target flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                  active ? 'text-[#007AFF]' : 'text-[#86868B]'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-[#007AFF]' : 'text-[#86868B]'}`} />
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
