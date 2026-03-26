export function formatDateForDiscord(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${parseInt(month)}/${parseInt(day)}（${weekdays[dateObj.getDay()]}）`;
}

// 全体チャンネルへの通知（ヘルプ募集など全員向け）
export async function sendDiscordNotification(message: string, mentionEveryone = false): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL is not set');
    return;
  }
  try {
    const content = mentionEveryone ? `@everyone\n${message}` : message;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      console.error('Discord webhook error:', await response.text());
    }
  } catch (error) {
    console.error('Discord notification failed:', error);
  }
}

// 店舗専用チャンネルへの通知（応募・確定など店長向け）
export async function sendStoreDiscordNotification(storeId: number, message: string): Promise<void> {
  const webhookUrl = process.env[`DISCORD_WEBHOOK_STORE_${storeId}`];
  if (!webhookUrl) {
    console.error(`DISCORD_WEBHOOK_STORE_${storeId} is not set`);
    return;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    if (!response.ok) {
      console.error(`Discord store ${storeId} webhook error:`, await response.text());
    }
  } catch (error) {
    console.error(`Discord store ${storeId} notification failed:`, error);
  }
}
