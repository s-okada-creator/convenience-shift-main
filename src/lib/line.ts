// LINE Messaging API プッシュ通知

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

// ヘルプ要請のLINE通知（複数の店長に送信）
export async function sendLineHelpRequestNotification(
  lineUserIds: string[],
  storeName: string,
  needDate: string,
  needStart: string,
  needEnd: string,
  memo: string | null
): Promise<void> {
  if (lineUserIds.length === 0) return;

  const formattedDate = formatDateForLine(needDate);
  const message = [
    `【緊急ヘルプ】${storeName}`,
    `${formattedDate} ${needStart}〜${needEnd}`,
    `人員要請が届きました`,
    `メモ: ${memo || 'なし'}`,
  ].join('\n');

  const results = await Promise.allSettled(
    lineUserIds.map((id) => sendLinePushMessage(id, message))
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`LINE通知: ${lineUserIds.length}件中${failures.length}件失敗`);
  }
}
