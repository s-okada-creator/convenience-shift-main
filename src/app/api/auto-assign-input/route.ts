import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  staff,
  availabilityPatterns,
  timeOffRequests,
  shiftRequirements,
  shifts,
} from '@/lib/db/schema';
import { getSession, canAccessStore } from '@/lib/auth';
import { eq, and, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }
    if (session.role === 'staff') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');
    const date = searchParams.get('date');

    if (!storeId || !date) {
      return NextResponse.json({ error: 'storeIdとdateは必須です' }, { status: 400 });
    }

    const storeIdNum = parseInt(storeId, 10);
    if (!canAccessStore(session, storeIdNum)) {
      return NextResponse.json({ error: 'この店舗へのアクセス権限がありません' }, { status: 403 });
    }

    const dayOfWeek = new Date(date).getDay();

    const staffList = await db
      .select({
        id: staff.id,
        name: staff.name,
        hourlyRate: staff.hourlyRate,
        employmentType: staff.employmentType,
      })
      .from(staff)
      .where(eq(staff.storeId, storeIdNum));

    const staffIds = staffList.map((s) => s.id);
    if (staffIds.length === 0) {
      return NextResponse.json({
        date,
        dayOfWeek,
        staff: [],
        availabilities: [],
        timeOffRequests: [],
        requirements: [],
        existingShifts: [],
      });
    }

    const [patterns, timeOff, requirements, existing] = await Promise.all([
      db
        .select()
        .from(availabilityPatterns)
        .where(
          and(
            inArray(availabilityPatterns.staffId, staffIds),
            eq(availabilityPatterns.dayOfWeek, dayOfWeek)
          )
        ),
      db
        .select()
        .from(timeOffRequests)
        .where(
          and(
            inArray(timeOffRequests.staffId, staffIds),
            eq(timeOffRequests.date, date),
            eq(timeOffRequests.status, 'approved')
          )
        ),
      db
        .select()
        .from(shiftRequirements)
        .where(
          and(
            eq(shiftRequirements.storeId, storeIdNum),
            eq(shiftRequirements.dayOfWeek, dayOfWeek)
          )
        ),
      db
        .select({
          id: shifts.id,
          staffId: shifts.staffId,
          startTime: shifts.startTime,
          endTime: shifts.endTime,
          staffName: staff.name,
        })
        .from(shifts)
        .leftJoin(staff, eq(shifts.staffId, staff.id))
        .where(and(eq(shifts.storeId, storeIdNum), eq(shifts.date, date))),
    ]);

    const response = {
      date,
      dayOfWeek,
      staff: staffList.map((s) => ({
        id: String(s.id),
        name: s.name,
        hourlyWage: s.hourlyRate,
        employmentType: s.employmentType,
      })),
      availabilities: patterns.map((p) => ({
        staffId: String(p.staffId),
        dayOfWeek: p.dayOfWeek,
        startTime: p.startTime.slice(0, 5),
        endTime: p.endTime.slice(0, 5),
      })),
      timeOffRequests: timeOff.map((t) => ({
        staffId: String(t.staffId),
        date: t.date,
        status: t.status,
      })),
      requirements: requirements.map((r) => {
        const timeSlot = r.timeSlot.slice(0, 5);
        const [hour, minute] = timeSlot.split(':').map(Number);
        return {
          dayOfWeek: r.dayOfWeek,
          hour,
          minute,
          requiredCount: r.requiredCount,
        };
      }),
      existingShifts: existing.map((s) => ({
        id: String(s.id),
        staffId: String(s.staffId),
        staffName: s.staffName || '不明',
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('自動割り振り入力取得エラー:', error);
    return NextResponse.json({ error: '自動割り振り入力の取得に失敗しました' }, { status: 500 });
  }
}
