import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ShiftCreateContent } from './shift-create-content';

export default async function ShiftCreatePage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  if (session.role === 'staff') {
    redirect('/dashboard');
  }

  return <ShiftCreateContent user={session} />;
}
