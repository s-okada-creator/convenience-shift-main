import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DashboardContent } from './dashboard-content';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return <DashboardContent user={session} />;
}
