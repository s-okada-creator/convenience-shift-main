import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shiftPostings, shiftApplications, shifts, stores, staff, notifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 応募を確定 or 見送り
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const postingId = parseInt(id);
    const body = await request.json();

    const { applicationId, action } = body;

    if (!applicationId) {
      throw ApiErrors.badRequest('applicationIdが必要です');
    }

    // 求人存在確認
    const [posting] = await db.select().from(shiftPostings).where(eq(shiftPostings.id, postingId));
    if (!posting) {
      throw ApiErrors.notFound('シフト求人');
    }

    // アクセス権チェック
    if (!canAccessStore(session, posting.storeId)) {
      throw ApiErrors.forbidden();
    }

    // 応募存在確認
    const [application] = await db
      .select()
      .from(shiftApplications)
      .where(
        and(
          eq(shiftApplications.id, applicationId),
          eq(shiftApplications.postingId, postingId)
        )
      );

    if (!application) {
      throw ApiErrors.notFound('応募');
    }

    if (application.status !== 'pending') {
      throw ApiErrors.badRequest('この応募は既に処理済みです');
    }

    // 見送りの場合
    if (action === 'reject') {
      await db
        .update(shiftApplications)
        .set({ status: 'rejected' })
        .where(eq(shiftApplications.id, applicationId));

      // アプリ内通知（応募者へ）
      try {
        const [store] = await db.select().from(stores).where(eq(stores.id, posting.storeId));
        await db.insert(notifications).values({
          userId: application.staffId,
          type: 'shift_posting_rejected',
          payload: {
            postingId,
            storeName: store?.name || '',
            date: posting.date,
            startTime: posting.startTime.slice(0, 5),
            endTime: posting.endTime.slice(0, 5),
          },
        });
      } catch (notifyError) {
        console.error('通知エラー:', notifyError);
      }

      return NextResponse.json({
        success: true,
        message: '応募を見送りました',
        applicationId,
        postingId,
      });
    }

    // 確定の場合
    // 定員チェック
    if (posting.filledCount >= posting.slots) {
      throw ApiErrors.badRequest('この求人は既に定員に達しています');
    }

    // 応募ステータスをconfirmedに
    await db
      .update(shiftApplications)
      .set({ status: 'confirmed' })
      .where(eq(shiftApplications.id, applicationId));

    // filledCountをインクリメント
    const newFilledCount = posting.filledCount + 1;
    const updateData: Record<string, unknown> = {
      filledCount: newFilledCount,
      updatedAt: new Date(),
    };

    // filledCount >= slots なら posting statusをfilledに
    if (newFilledCount >= posting.slots) {
      updateData.status = 'filled';
    }

    await db
      .update(shiftPostings)
      .set(updateData)
      .where(eq(shiftPostings.id, postingId));

    // シフトを自動登録（応募者の所属店舗と募集店舗が異なる場合は他店ヘルプ扱い）
    const [applicantStaff] = await db.select({ storeId: staff.storeId }).from(staff).where(eq(staff.id, application.staffId));
    const isOtherStore = applicantStaff ? applicantStaff.storeId !== posting.storeId : false;

    await db.insert(shifts).values({
      staffId: application.staffId,
      storeId: posting.storeId,
      date: posting.date,
      startTime: posting.startTime,
      endTime: posting.endTime,
      isHelpFromOtherStore: isOtherStore,
    });

    // アプリ内通知（確定されたスタッフへ）
    try {
      const [store] = await db.select().from(stores).where(eq(stores.id, posting.storeId));
      await db.insert(notifications).values({
        userId: application.staffId,
        type: 'shift_posting_confirmed',
        payload: {
          postingId,
          storeName: store?.name || '',
          date: posting.date,
          startTime: posting.startTime.slice(0, 5),
          endTime: posting.endTime.slice(0, 5),
          filledCount: newFilledCount,
          totalSlots: posting.slots,
        },
      });
    } catch (notifyError) {
      console.error('通知エラー:', notifyError);
    }

    return NextResponse.json({
      success: true,
      message: '応募を確定しました',
      applicationId,
      postingId,
      filledCount: newFilledCount,
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/shift-postings/[id]/confirm');
  }
}
