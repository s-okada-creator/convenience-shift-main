import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { CreatePostingContent } from './create-posting-content';

export default async function CreatePostingPage() {
  const session = await getSession();
  if (!session) redirect('/');
  if (session.role === 'staff') redirect('/dashboard/shift-board');
  return <CreatePostingContent user={session} />;
}
