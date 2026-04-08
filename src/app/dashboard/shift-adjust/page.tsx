import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ShiftAdjustContent } from './shift-adjust-content';

export default async function ShiftAdjustPage() {
  const session = await getSession();
  if (!session) redirect('/');
  if (session.role === 'staff') redirect('/dashboard');
  return <ShiftAdjustContent user={session} />;
}
