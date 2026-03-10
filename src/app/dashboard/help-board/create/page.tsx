import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { CreateHelpContent } from './create-help-content';

export default async function CreateHelpPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return <CreateHelpContent user={session} />;
}
