import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shiftPostings, shiftApplications, stores, staff } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';
import { handleApiError, ApiErrors } from '@/lib/api-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const normalizeTime = <T extends { startTime: string; endTime: string }>(row: T) => ({
  ...row,
  startTime: row.startTime.slice(0, 5),
  endTime: row.endTime.slice(0, 5),
});

// シフト求人詳細取得（応募一覧付き）
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      throw ApiErrors.unauthorized();
    }

    const { id } = await params;
    const postingId = parseInt(id);

    const [posting] = await db
      .select({
        id: shiftPostings.id,
        storeId: shiftPostings.storeId,
        storeName: stores.name,
        postedBy: shiftPostings.postedBy,
        postedByName: staff.name,
        date: shiftPostings.date,
        startTime: shiftPostings.startTime,
        endTime: shiftPostings.endTime,
        slots: shiftPostings.slots,
        filledCount: shiftPostings.filledCount,
        description: shiftPostings.description,
        status: shiftPostings.status,
        createdAt: shiftPostings.createdAt,
        updatedAt: shiftPostings.updatedAt,
      })
      .from(shiftPostings)
      .leftJoin(stores, eq(shiftPostings.storeId, stores.id))
      .leftJoin(staff, eq(shiftPostings.postedBy, staff.id))
      .where(eq(shiftPostings.id, postingId));

    if (!posting) {
      throw ApiErrors.notFound('シフト求人');
    }

    // 応募一覧取得（JOINでstaffName, staffStoreName取得）
    const staffStore = db
      .select({
        id: stores.id,
        name: stores.name,
      })
      .from(stores)
      .as('staff_store');

    const applications = await db
      .select({
        id: shiftApplications.id,
        postingId: shiftApplications.postingId,
        staffId: shiftApplications.staffId,
        staffName: staff.name,
        staffStoreId: staff.storeId,
        staffStoreName: staffStore.name,
        message: shiftApplications.message,
        status: shiftApplications.status,
        createdAt: shiftApplications.createdAt,
      })
      .from(shiftApplications)
      .leftJoin(staff, eq(shiftApplications.staffId, staff.id))
      .leftJoin(staffStore, eq(staff.storeId, staffStore.id))
      .where(eq(shiftApplications.postingId, postingId));

    return NextResponse.json({
      ...normalizeTime(posting),
      applications,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/shift-postings/[id]');
  }
}

// シフト求人更新
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const postingId = parseInt(id);
    const body = await request.json();

    const [existing] = await db.select().from(shiftPostings).where(eq(shiftPostings.id, postingId));
    if (!existing) {
      throw ApiErrors.notFound('シフト求人');
    }

    if (!canAccessStore(session, existing.storeId)) {
      throw ApiErrors.forbidden();
    }

    const { slots, description, status } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (slots !== undefined) updateData.slots = slots;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    const [updated] = await db
      .update(shiftPostings)
      .set(updateData)
      .where(eq(shiftPostings.id, postingId))
      .returning();

    return NextResponse.json(normalizeTime(updated));
  } catch (error) {
    return handleApiError(error, 'PUT /api/shift-postings/[id]');
  }
}

// シフト求人削除
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const postingId = parseInt(id);

    const [existing] = await db.select().from(shiftPostings).where(eq(shiftPostings.id, postingId));
    if (!existing) {
      throw ApiErrors.notFound('シフト求人');
    }

    if (!canAccessStore(session, existing.storeId)) {
      throw ApiErrors.forbidden();
    }

    // 確定済み応募がある場合は削除不可
    const confirmedApplications = await db
      .select({ id: shiftApplications.id })
      .from(shiftApplications)
      .where(
        and(
          eq(shiftApplications.postingId, postingId),
          eq(shiftApplications.status, 'confirmed')
        )
      );

    if (confirmedApplications.length > 0) {
      throw ApiErrors.badRequest('確定済みの応募がある求人は削除できません');
    }

    await db.delete(shiftPostings).where(eq(shiftPostings.id, postingId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/shift-postings/[id]');
  }
}
