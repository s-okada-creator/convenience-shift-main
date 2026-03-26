import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shiftPostings, shiftApplications, shifts, stores, staff } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { formatDateForLine, notifyStoreManagers, notifyStaff, APP_URL } from '@/lib/line';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 応募を確定
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const postingId = parseInt(id);
    const body = await request.json();

    const { applicationId } = body;

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
      throw ApiErrors.badRequest('この応募は確定できません');
    }

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

    // シフトを自動登録
    await db.insert(shifts).values({
      staffId: application.staffId,
      storeId: posting.storeId,
      date: posting.date,
      startTime: posting.startTime,
      endTime: posting.endTime,
      isHelpFromOtherStore: false,
    });

    // LINE通知
    try {
      const [store] = await db.select().from(stores).where(eq(stores.id, posting.storeId));
      const [confirmedStaff] = await db.select().from(staff).where(eq(staff.id, application.staffId));
      const formattedDate = formatDateForLine(posting.date);
      const managerMessage = [
        `✅ シフト求人が確定しました！`,
        ``,
        `📍 ${store?.name || ''}`,
        `📅 ${formattedDate} ${posting.startTime.slice(0, 5)}〜${posting.endTime.slice(0, 5)}`,
        `👤 @${confirmedStaff?.name || ''}さんが確定`,
        `📊 ${newFilledCount}/${posting.slots}人 確定済み`,
        `📋 シフト自動登録済み`,
        ``,
        `🔗 ${APP_URL}/dashboard/shift-board/${postingId}`,
      ].join('\n');
      await notifyStoreManagers(posting.storeId, managerMessage);
      // 確定されたスタッフ本人にも通知
      const staffMessage = [
        `✅ シフトが確定しました！`,
        ``,
        `📍 勤務先: ${store?.name || ''}`,
        `📅 ${formattedDate} ${posting.startTime.slice(0, 5)}〜${posting.endTime.slice(0, 5)}`,
        `📋 シフトは自動で登録されています`,
        ``,
        `👇 自分のシフトを確認`,
        `🔗 ${APP_URL}/dashboard/my-shifts`,
      ].join('\n');
      await notifyStaff(application.staffId, staffMessage);
    } catch (lineError) {
      console.error('LINE通知エラー（確定自体は成功）:', lineError);
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
