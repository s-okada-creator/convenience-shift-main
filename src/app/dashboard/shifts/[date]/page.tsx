import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DailyShiftContent } from './daily-shift-content';

interface DailyShiftPageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ storeId?: string }>;
}

export default async function DailyShiftPage({ params, searchParams }: DailyShiftPageProps) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // 管理者のみアクセス可能
  if (session.role === 'staff') {
    redirect('/dashboard');
  }

  const { date } = await params;
  const { storeId } = await searchParams;

  return (
    <DailyShiftContent
      user={session}
      date={date}
      initialStoreId={storeId ? parseInt(storeId) : undefined}
    />
  );
}
