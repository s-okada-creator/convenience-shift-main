import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { RequirementsContent } from './requirements-content';

export default async function RequirementsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // 管理者のみアクセス可能
  if (session.role !== 'owner' && session.role !== 'manager') {
    redirect('/dashboard');
  }

  return <RequirementsContent user={session} />;
}
