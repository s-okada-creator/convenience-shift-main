import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { TimeOffContent } from './time-off-content';

export default async function TimeOffPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return <TimeOffContent user={session} />;
}
