import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ShiftsContent } from './shifts-content';

export default async function ShiftsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // 管理者のみアクセス可能
  if (session.role === 'staff') {
    redirect('/dashboard');
  }

  return <ShiftsContent user={session} />;
}
