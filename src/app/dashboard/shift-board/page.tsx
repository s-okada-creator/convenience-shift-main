import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ShiftBoardContent } from './shift-board-content';

export default async function ShiftBoardPage() {
  const session = await getSession();
  if (!session) redirect('/');
  return <ShiftBoardContent user={session} />;
}
