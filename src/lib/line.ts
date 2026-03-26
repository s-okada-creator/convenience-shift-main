// LINE Messaging API プッシュ通知
import { db } from '@/lib/db';
import { staff, stores } from '@/lib/db/schema';
import { eq, and, ne, inArray } from 'drizzle-orm';

export function formatDateForLine(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${parseInt(month)}/${parseInt(day)}（${weekdays[dateObj.getDay()]}）`;
}

// 個別ユーザーへのプッシュ通知送信
export async function sendLinePushMessage(
  lineUserId: string,
  message: string
): Promise<void> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.warn('LINE_CHANNEL_ACCESS_TOKEN is not set, skipping LINE notification');
    return;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: message }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`LINE push error (userId: ${lineUserId}):`, errorText);
  }
}

// 複数ユーザーにLINE通知を一括送信
async function sendLineToMultiple(lineUserIds: string[], message: string): Promise<void> {
  const ids = lineUserIds.filter(Boolean);
  if (ids.length === 0) return;

  const results = await Promise.allSettled(
    ids.map((id) => sendLinePushMessage(id, message))
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`LINE通知: ${ids.length}件中${failures.length}件失敗`);
  }
}

// 全店長・オーナーにLINE通知
export async function notifyAllManagers(message: string): Promise<void> {
  const managers = await db.select({ lineUserId: staff.lineUserId })
    .from(staff)
    .where(inArray(staff.role, ['owner', 'manager']));
  const ids = managers.map(m => m.lineUserId).filter((id): id is string => !!id);
  await sendLineToMultiple(ids, message);
}

// 特定店舗の店長にLINE通知
export async function notifyStoreManagers(storeId: number, message: string): Promise<void> {
  const managers = await db.select({ lineUserId: staff.lineUserId })
    .from(staff)
    .where(and(
      eq(staff.storeId, storeId),
      inArray(staff.role, ['owner', 'manager'])
    ));
  // オーナーも通知（全店舗管轄）
  const owners = await db.select({ lineUserId: staff.lineUserId })
    .from(staff)
    .where(eq(staff.role, 'owner'));
  const allIds = [...managers, ...owners].map(m => m.lineUserId).filter((id): id is string => !!id);
  const uniqueIds = [...new Set(allIds)];
  await sendLineToMultiple(uniqueIds, message);
}

// 特定スタッフにLINE通知（staffId指定）
export async function notifyStaff(staffId: number, message: string): Promise<void> {
  const [s] = await db.select({ lineUserId: staff.lineUserId })
    .from(staff)
    .where(eq(staff.id, staffId));
  if (s?.lineUserId) {
    await sendLinePushMessage(s.lineUserId, message);
  }
}

// 複数スタッフにLINE通知（staffId配列指定）
export async function notifyStaffMultiple(staffIds: number[], message: string): Promise<void> {
  if (staffIds.length === 0) return;
  const staffList = await db.select({ lineUserId: staff.lineUserId })
    .from(staff)
    .where(inArray(staff.id, staffIds));
  const ids = staffList.map(s => s.lineUserId).filter((id): id is string => !!id);
  await sendLineToMultiple(ids, message);
}
