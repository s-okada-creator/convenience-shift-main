import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { HelpDetailContent } from './help-detail-content';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HelpDetailPage({ params }: Props) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  const { id } = await params;

  return <HelpDetailContent user={session} helpRequestId={id} />;
}
