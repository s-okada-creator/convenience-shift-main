import { redirect } from 'next/navigation';
import { getSession, requireAdmin } from '@/lib/auth';
import { StaffListContent } from './staff-list-content';

export default async function StaffPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // 管理者のみアクセス可能
  if (session.role === 'staff') {
    redirect('/dashboard');
  }

  return <StaffListContent user={session} />;
}
