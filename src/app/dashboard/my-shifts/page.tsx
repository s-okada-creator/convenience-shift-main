import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { MyShiftsContent } from './my-shifts-content';

export default async function MyShiftsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return <MyShiftsContent user={session} />;
}
