import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  stores,
  staff,
  availabilityPatterns,
  shiftRequirements,
} from './schema';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// 日本人の名前リスト
const firstNames = [
  '太郎', '花子', '一郎', '美咲', '健太', '愛', '翔太', '優子', '大輔', '真由',
  '拓也', '明美', '雄太', '恵子', '直樹', '千春', '和也', '由美', '哲也', '智子',
  '隆', '裕子', '誠', '幸子', '浩二', '理恵', '洋介', '純子', '正樹', '久美子',
  '達也', '麻衣', '勇気', '彩香', '光', '沙織', '悠人', '瞳', '蓮', '紗希',
  '大地', '未来', '海斗', '桜', '颯太', '葵', '陸', '楓', '蒼', '凛',
  '悠真', '結衣', '朝陽', '咲良', '湊', '陽菜', '奏', '莉子', '樹', '芽依',
];

const lastNames = [
  '山田', '佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林',
  '加藤', '吉田', '山口', '松本', '井上', '木村', '林', '斎藤', '清水', '森',
];

function getRandomName(): string {
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${last}${first}`;
}

function getRandomPhone(): string {
  const prefix = ['090', '080', '070'][Math.floor(Math.random() * 3)];
  const mid = Math.floor(Math.random() * 9000) + 1000;
  const end = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${mid}-${end}`;
}

async function seed() {
  console.log('シードデータの投入を開始します...');

  // 1. 店舗データの作成
  console.log('店舗データを作成中...');
  const storeData = [
    { name: '渋谷店' },
    { name: '新宿店' },
    { name: '池袋店' },
  ];
  const insertedStores = await db.insert(stores).values(storeData).returning();
  console.log(`${insertedStores.length}店舗を作成しました`);

  // 2. スタッフデータの作成（各店舗20名: 社員3名 + アルバイト17名）
  console.log('スタッフデータを作成中...');
  const staffData: (typeof staff.$inferInsert)[] = [];

  for (const store of insertedStores) {
    // オーナー（渋谷店のみ）
    if (store.id === insertedStores[0].id) {
      staffData.push({
        storeId: store.id,
        name: '山田太郎',
        email: 'owner@example.com',
        phone: '090-1234-5678',
        employmentType: 'employee',
        hourlyRate: 2000,
        joinedAt: '2020-01-01',
        skillLevel: 5,
        role: 'owner',
      });
    }

    // 店長（各店舗1名）
    const managerNames = ['佐藤花子', '鈴木一郎', '高橋美咲'];
    const managerIndex = insertedStores.indexOf(store);
    staffData.push({
      storeId: store.id,
      name: managerNames[managerIndex],
      email: `manager${store.id}@example.com`,
      phone: getRandomPhone(),
      employmentType: 'employee',
      hourlyRate: 1800,
      joinedAt: '2021-04-01',
      skillLevel: 4,
      role: 'manager',
    });

    // 社員（各店舗2名）
    for (let i = 0; i < 2; i++) {
      staffData.push({
        storeId: store.id,
        name: getRandomName(),
        email: `employee${store.id}_${i}@example.com`,
        phone: getRandomPhone(),
        employmentType: 'employee',
        hourlyRate: 1500,
        joinedAt: `2022-0${i + 1}-01`,
        skillLevel: 3,
        role: 'staff',
      });
    }

    // アルバイト（各店舗17名）
    for (let i = 0; i < 17; i++) {
      const hourlyRate = 1100 + Math.floor(Math.random() * 200); // 1100〜1300円
      const isStudent = i < 8; // 約半数が学生
      const joinedYear = 2022 + Math.floor(Math.random() * 3);
      const joinedMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');

      staffData.push({
        storeId: store.id,
        name: getRandomName(),
        email: `part_time${store.id}_${i}@example.com`,
        phone: getRandomPhone(),
        employmentType: 'part_time',
        hourlyRate,
        joinedAt: `${joinedYear}-${joinedMonth}-01`,
        skillLevel: Math.floor(Math.random() * 3) + 1,
        notes: isStudent ? '学生' : null,
        role: 'staff',
      });
    }
  }

  const insertedStaff = await db.insert(staff).values(staffData).returning();
  console.log(`${insertedStaff.length}名のスタッフを作成しました`);

  // 3. 基本勤務可能時間パターンの作成
  console.log('勤務可能時間パターンを作成中...');
  const availabilityData: (typeof availabilityPatterns.$inferInsert)[] = [];

  for (const s of insertedStaff) {
    const isStudent = s.notes === '学生';
    const isEmployee = s.employmentType === 'employee';

    if (isEmployee) {
      // 社員は全日フルタイム可能（深夜帯含む24時間対応）
      for (let day = 0; day < 7; day++) {
        availabilityData.push({
          staffId: s.id,
          dayOfWeek: day,
          startTime: '00:00',
          endTime: '23:30',
        });
      }
    } else if (isStudent) {
      // 学生は平日夕方〜、土日はフル
      for (let day = 0; day < 7; day++) {
        if (day === 0 || day === 6) {
          // 土日
          availabilityData.push({
            staffId: s.id,
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '22:00',
          });
        } else {
          // 平日
          availabilityData.push({
            staffId: s.id,
            dayOfWeek: day,
            startTime: '16:00',
            endTime: '22:00',
          });
        }
      }
    } else {
      // 主婦・フリーターなどはランダム（深夜帯パターンを追加）
      const patterns = [
        { start: '06:00', end: '14:00' }, // 早番
        { start: '09:00', end: '17:00' }, // 日中
        { start: '14:00', end: '22:00' }, // 遅番
        { start: '22:00', end: '23:30' }, // 深夜前半
        { start: '00:00', end: '06:00' }, // 深夜後半
      ];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];

      for (let day = 0; day < 7; day++) {
        // 週に1-2日は休み
        if (Math.random() > 0.7) continue;

        availabilityData.push({
          staffId: s.id,
          dayOfWeek: day,
          startTime: pattern.start,
          endTime: pattern.end,
        });
      }
    }
  }

  await db.insert(availabilityPatterns).values(availabilityData);
  console.log(`${availabilityData.length}件の勤務可能時間パターンを作成しました`);

  // 4. シフト必要人数の作成（30分単位）
  console.log('シフト必要人数を設定中...');
  const requirementsData: (typeof shiftRequirements.$inferInsert)[] = [];

  for (const store of insertedStores) {
    for (let day = 0; day < 7; day++) {
      // 24時間を30分単位で設定
      for (let hour = 0; hour < 24; hour++) {
        for (const minute of ['00', '30']) {
          const timeSlot = `${String(hour).padStart(2, '0')}:${minute}`;

          // 時間帯によって必要人数を変える
          let requiredCount: number;
          if (hour >= 7 && hour < 9) {
            // 朝のラッシュ
            requiredCount = day === 0 || day === 6 ? 3 : 4;
          } else if (hour >= 11 && hour < 14) {
            // ランチタイム
            requiredCount = 4;
          } else if (hour >= 17 && hour < 20) {
            // 夕方のラッシュ
            requiredCount = day === 0 || day === 6 ? 4 : 5;
          } else if (hour >= 22 || hour < 6) {
            // 深夜
            requiredCount = 2;
          } else {
            // その他
            requiredCount = 3;
          }

          requirementsData.push({
            storeId: store.id,
            dayOfWeek: day,
            timeSlot,
            requiredCount,
          });
        }
      }
    }
  }

  await db.insert(shiftRequirements).values(requirementsData);
  console.log(`${requirementsData.length}件のシフト必要人数を設定しました`);

  console.log('シードデータの投入が完了しました！');
}

seed()
  .catch((error) => {
    console.error('シードエラー:', error);
    process.exit(1);
  });
