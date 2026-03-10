import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { HelpBoardContent } from './help-board-content';

export default async function HelpBoardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return <HelpBoardContent user={session} />;
}
