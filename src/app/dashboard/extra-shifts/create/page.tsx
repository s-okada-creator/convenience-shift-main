import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { CreateExtraShiftContent } from './create-extra-shift-content';

export default async function CreateExtraShiftPage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return <CreateExtraShiftContent user={session} />;
}
