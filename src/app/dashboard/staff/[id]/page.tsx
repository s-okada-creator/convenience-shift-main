import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { StaffDetailContent } from './staff-detail-content';

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // 管理者のみアクセス可能
  if (session.role === 'staff') {
    redirect('/dashboard');
  }

  const { id } = await params;

  return <StaffDetailContent user={session} staffId={parseInt(id)} />;
}
