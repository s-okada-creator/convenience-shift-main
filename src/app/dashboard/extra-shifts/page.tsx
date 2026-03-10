import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ExtraShiftsContent } from './extra-shifts-content';

export default async function ExtraShiftsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return <ExtraShiftsContent user={session} />;
}
