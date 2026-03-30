import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shiftPostings, shiftApplications, stores, staff, notifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// シフト求人に応募
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const postingId = parseInt(id);
    const body = await request.json();

    const { message } = body;

    // 求人存在確認
    const [posting] = await db.select().from(shiftPostings).where(eq(shiftPostings.id, postingId));
    if (!posting) {
      throw ApiErrors.notFound('シフト求人');
    }

    // ステータスチェック
    if (posting.status !== 'open') {
      throw ApiErrors.badRequest('この求人は現在募集していません');
    }

    // すでにfilledかチェック
    if (posting.filledCount >= posting.slots) {
      throw ApiErrors.badRequest('この求人は既に定員に達しています');
    }

    // 重複応募チェック
    const existingApplication = await db
      .select({ id: shiftApplications.id })
      .from(shiftApplications)
      .where(
        and(
          eq(shiftApplications.postingId, postingId),
          eq(shiftApplications.staffId, session.id)
        )
      );

    if (existingApplication.length > 0) {
      throw ApiErrors.conflict('既にこの求人に応募済みです');
    }

    // 応募作成
    const [newApplication] = await db.insert(shiftApplications).values({
      postingId,
      staffId: session.id,
      message: message || null,
      status: 'pending',
    }).returning();

    // 応募数を取得
    const applicationCount = await db
      .select({ id: shiftApplications.id })
      .from(shiftApplications)
      .where(eq(shiftApplications.postingId, postingId));

    // アプリ内通知（募集を出した店舗のマネージャーへ）
    try {
      const [store] = await db.select().from(stores).where(eq(stores.id, posting.storeId));
      const [applicant] = await db.select().from(staff).where(eq(staff.id, session.id));
      // 該当店舗のマネージャー/オーナーに通知
      const managers = await db
        .select({ id: staff.id })
        .from(staff)
        .where(
          and(
            eq(staff.storeId, posting.storeId),
            // role check: owner or manager
          )
        );
      // postedByにも通知
      const notifyTargets = new Set([posting.postedBy, ...managers.map(m => m.id)]);
      const notificationRecords = [...notifyTargets]
        .filter(id => id !== session.id)
        .map((userId) => ({
          userId,
          type: 'shift_posting_application',
          payload: {
            postingId,
            storeName: store?.name || '',
            applicantName: applicant?.name || session.name,
            date: posting.date,
            startTime: posting.startTime.slice(0, 5),
            endTime: posting.endTime.slice(0, 5),
            message: message || null,
          },
        }));
      if (notificationRecords.length > 0) {
        await db.insert(notifications).values(notificationRecords);
      }
    } catch (notifyError) {
      console.error('通知エラー（応募自体は成功）:', notifyError);
    }

    return NextResponse.json({
      application: newApplication,
      applicationCount: applicationCount.length,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/shift-postings/[id]/apply');
  }
}
