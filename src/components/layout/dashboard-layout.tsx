'use client';

import { memo, Suspense } from 'react';
import { Sidebar } from './sidebar';
import { BottomNavigation } from './bottom-navigation';
import type { SessionUser } from '@/lib/auth';

interface DashboardLayoutProps {
  user: SessionUser;
  children: React.ReactNode;
  title?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-[#E5E5EA] rounded-lg w-48" />
      <div className="h-4 bg-[#E5E5EA] rounded w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 bg-[#E5E5EA] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export const DashboardLayout = memo(function DashboardLayout({
  user,
  children,
  title,
  description,
  actions,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <Sidebar user={user} />

      {/* メインコンテンツエリア */}
      <main className="lg:pl-64">
        {/* モバイル用スペーサー */}
        <div className="h-14 lg:hidden" />

        <div className="p-4 pb-20 sm:p-6 sm:pb-20 lg:p-8 lg:pb-8">
          {/* ページヘッダー */}
          {(title || actions) && (
            <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                {title && (
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#1D1D1F] tracking-tight">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className="mt-1 text-sm sm:text-base text-[#86868B]">
                    {description}
                  </p>
                )}
              </div>
              {actions && (
                <div className="flex items-center gap-3">
                  {actions}
                </div>
              )}
            </div>
          )}

          {/* コンテンツ */}
          <Suspense fallback={<LoadingSkeleton />}>
            {children}
          </Suspense>
        </div>
      </main>

      <BottomNavigation user={user} />
    </div>
  );
});

export function PageSection({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-[#E5E5EA] p-4 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function PageGrid({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid gap-4 sm:gap-6 ${gridCols[cols]}`}>
      {children}
    </div>
  );
}
