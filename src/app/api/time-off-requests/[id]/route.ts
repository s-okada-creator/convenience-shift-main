import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeOffRequests, staff } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, getSession, canAccessStore } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 休み希望詳細取得
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { id } = await params;
    const requestId = parseInt(id);

    const [timeOffRequest] = await db
      .select({
        id: timeOffRequests.id,
        staffId: timeOffRequests.staffId,
        date: timeOffRequests.date,
        status: timeOffRequests.status,
        createdAt: timeOffRequests.createdAt,
        reason: timeOffRequests.reason,
        staffName: staff.name,
        staffStoreId: staff.storeId,
      })
      .from(timeOffRequests)
      .leftJoin(staff, eq(timeOffRequests.staffId, staff.id))
      .where(eq(timeOffRequests.id, requestId));

    if (!timeOffRequest) {
      return NextResponse.json({ error: '休み希望が見つかりません' }, { status: 404 });
    }

    // スタッフは自分の休み希望のみ閲覧可能
    if (session.role === 'staff' && timeOffRequest.staffId !== session.id) {
      return NextResponse.json({ error: 'この休み希望へのアクセス権限がありません' }, { status: 403 });
    }

    // 管理者は店舗権限チェック
    if (session.role !== 'staff' && timeOffRequest.staffStoreId) {
      if (!canAccessStore(session, timeOffRequest.staffStoreId)) {
        return NextResponse.json({ error: 'この休み希望へのアクセス権限がありません' }, { status: 403 });
      }
    }

    return NextResponse.json(timeOffRequest);
  } catch (error) {
    console.error('休み希望詳細取得エラー:', error);
    return NextResponse.json({ error: '休み希望詳細の取得に失敗しました' }, { status: 500 });
  }
}

// 休み希望更新（承認・却下）
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);
    const body = await request.json();

    // 既存の休み希望確認
    const [existingRequest] = await db
      .select({
        id: timeOffRequests.id,
        staffId: timeOffRequests.staffId,
        date: timeOffRequests.date,
        status: timeOffRequests.status,
        staffStoreId: staff.storeId,
      })
      .from(timeOffRequests)
      .leftJoin(staff, eq(timeOffRequests.staffId, staff.id))
      .where(eq(timeOffRequests.id, requestId));

    if (!existingRequest) {
      return NextResponse.json({ error: '休み希望が見つかりません' }, { status: 404 });
    }

    // 店舗権限チェック
    if (existingRequest.staffStoreId && !canAccessStore(session, existingRequest.staffStoreId)) {
      return NextResponse.json({ error: 'この休み希望へのアクセス権限がありません' }, { status: 403 });
    }

    const { status } = body;

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: '無効なステータスです' }, { status: 400 });
    }

    const [updatedRequest] = await db
      .update(timeOffRequests)
      .set({ status })
      .where(eq(timeOffRequests.id, requestId))
      .returning();

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('休み希望更新エラー:', error);
    if (error instanceof Error && error.message === '管理者権限が必要です') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: '休み希望の更新に失敗しました' }, { status: 500 });
  }
}

// 休み希望削除
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { id } = await params;
    const requestId = parseInt(id);

    // 既存の休み希望確認
    const [existingRequest] = await db
      .select({
        id: timeOffRequests.id,
        staffId: timeOffRequests.staffId,
        status: timeOffRequests.status,
        staffStoreId: staff.storeId,
      })
      .from(timeOffRequests)
      .leftJoin(staff, eq(timeOffRequests.staffId, staff.id))
      .where(eq(timeOffRequests.id, requestId));

    if (!existingRequest) {
      return NextResponse.json({ error: '休み希望が見つかりません' }, { status: 404 });
    }

    // スタッフは自分の休み希望のみ削除可能（ただし未承認のみ）
    if (session.role === 'staff') {
      if (existingRequest.staffId !== session.id) {
        return NextResponse.json({ error: 'この休み希望へのアクセス権限がありません' }, { status: 403 });
      }
      if (existingRequest.status !== 'pending') {
        return NextResponse.json({ error: '承認済みまたは却下済みの休み希望は削除できません' }, { status: 400 });
      }
    }

    // 管理者は店舗権限チェック
    if (session.role !== 'staff' && existingRequest.staffStoreId) {
      if (!canAccessStore(session, existingRequest.staffStoreId)) {
        return NextResponse.json({ error: 'この休み希望へのアクセス権限がありません' }, { status: 403 });
      }
    }

    await db.delete(timeOffRequests).where(eq(timeOffRequests.id, requestId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('休み希望削除エラー:', error);
    return NextResponse.json({ error: '休み希望の削除に失敗しました' }, { status: 500 });
  }
}
