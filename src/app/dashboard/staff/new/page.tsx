import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { NewStaffContent } from './new-staff-content';

export default async function NewStaffPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // 管理者のみアクセス可能
  if (session.role === 'staff') {
    redirect('/dashboard');
  }

  return <NewStaffContent user={session} />;
}
