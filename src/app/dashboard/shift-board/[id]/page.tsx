import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { PostingDetailContent } from './posting-detail-content';

export default async function PostingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/');
  const { id } = await params;
  return <PostingDetailContent user={session} postingId={id} />;
}
