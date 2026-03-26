export function formatDateForDiscord(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${parseInt(month)}/${parseInt(day)}（${weekdays[dateObj.getDay()]}）`;
}

// 全体チャンネルへの通知（現在無効化中）
export async function sendDiscordNotification(_message: string, _mentionEveryone = false): Promise<void> {
  return;
}

// 店舗専用チャンネルへの通知（現在無効化中）
export async function sendStoreDiscordNotification(_storeId: number, _message: string): Promise<void> {
  return;
}
