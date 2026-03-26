import { config } from 'dotenv';
config({ path: '.env.local' });

async function testDiscord() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL が設定されていません');
    process.exit(1);
  }

  console.log('Discord Webhook テスト送信中...');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '【テスト通知】シフト管理システムからのDiscord連携テストです。\n\nこのメッセージが見えていれば正常に動作しています。\n\n通知パターン例：\n🔴 【緊急ヘルプ】寝屋川A店より 3/12(木) 14:00〜18:00 の人員要請\n🟡 【申し出】寝屋川B店 田中さんが対応可能です\n🟢 【確定】寝屋川A店のヘルプが確定しました\n🟢 【追加勤務希望】山田さん（寝屋川C店）が 3/15 09:00〜17:00 勤務可能です',
    }),
  });

  console.log('Status:', res.status);
  if (res.ok) {
    console.log('✅ Discord通知テスト成功！Discordを確認してください。');
  } else {
    const body = await res.text();
    console.error('❌ Discord通知テスト失敗:', body);
  }
}

testDiscord();
