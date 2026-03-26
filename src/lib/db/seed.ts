import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  stores,
  staff,
  availabilityPatterns,
  shiftRequirements,
  shifts,
  notifications,
  helpRequests,
  helpOffers,
  staffHelpResponses,
  proactiveOffers,
  shiftPostings,
  shiftApplications,
} from './schema';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seed() {
  console.log('シードデータの投入を開始します...');

  // 0. 既存データをクリア（順序はFK制約に注意）
  console.log('既存データをクリア中...');
  await db.delete(shiftApplications);
  await db.delete(shiftPostings);
  await db.delete(notifications);
  await db.delete(staffHelpResponses);
  await db.delete(helpOffers);
  await db.delete(helpRequests);
  await db.delete(proactiveOffers);
  await db.delete(shiftRequirements);
  await db.delete(availabilityPatterns);
  await db.delete(shifts);
  await db.delete(staff);
  await db.delete(stores);

  // 1. 店舗データの作成
  console.log('店舗データを作成中...');
  const storeData = [
    { name: '寝屋川A店' },
    { name: '寝屋川B店' },
    { name: '寝屋川C店' },
  ];
  const insertedStores = await db.insert(stores).values(storeData).returning();
  console.log(`${insertedStores.length}店舗を作成しました`);

  const [storeA, storeB, storeC] = insertedStores;

  // 2. スタッフデータの作成（1オーナー + 3店長 + 9アルバイト = 13名）
  console.log('スタッフデータを作成中...');
  const staffData: (typeof staff.$inferInsert)[] = [
    // ID=1: オーナー
    {
      storeId: storeA.id,
      name: '畑山オーナー',
      email: 'owner@example.com',
      phone: '090-1234-5678',
      employmentType: 'employee',
      hourlyRate: 2000,
      joinedAt: '2020-01-01',
      skillLevel: 5,
      role: 'owner',
      canWorkOtherStores: true,
      skills: '全業務',
      maxHoursPerWeek: 60,
    },
    // ID=2: A店 店長
    {
      storeId: storeA.id,
      name: '山田太郎',
      email: 'manager1@example.com',
      phone: '090-2345-6789',
      employmentType: 'employee',
      hourlyRate: 1800,
      joinedAt: '2021-04-01',
      skillLevel: 4,
      role: 'manager',
      canWorkOtherStores: true,
      skills: '全業務・店舗管理',
      maxHoursPerWeek: 50,
    },
    // ID=3: B店 店長
    {
      storeId: storeB.id,
      name: '佐藤花子',
      email: 'manager2@example.com',
      phone: '090-3456-7890',
      employmentType: 'employee',
      hourlyRate: 1800,
      joinedAt: '2021-04-01',
      skillLevel: 4,
      role: 'manager',
      canWorkOtherStores: true,
      skills: '全業務・店舗管理',
      maxHoursPerWeek: 50,
    },
    // ID=4: C店 店長
    {
      storeId: storeC.id,
      name: '鈴木一郎',
      email: 'manager3@example.com',
      phone: '090-4567-8901',
      employmentType: 'employee',
      hourlyRate: 1800,
      joinedAt: '2021-04-01',
      skillLevel: 4,
      role: 'manager',
      canWorkOtherStores: true,
      skills: '全業務・店舗管理',
      maxHoursPerWeek: 50,
    },
    // ID=5: A店 アルバイト（デモログイン用）
    {
      storeId: storeA.id,
      name: '高橋健太',
      email: 'part_a1@example.com',
      phone: '080-1111-2222',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-04-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=6: A店 アルバイト
    {
      storeId: storeA.id,
      name: '田中美咲',
      email: 'part_a2@example.com',
      phone: '080-2222-3333',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-06-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=7: A店 アルバイト
    {
      storeId: storeA.id,
      name: '木村翔太',
      email: 'part_a3@example.com',
      phone: '080-3333-4444',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-09-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=8: B店 アルバイト
    {
      storeId: storeB.id,
      name: '中村優子',
      email: 'part_b1@example.com',
      phone: '080-4444-5555',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-04-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=9: B店 アルバイト
    {
      storeId: storeB.id,
      name: '小林大輝',
      email: 'part_b2@example.com',
      phone: '080-5555-6666',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-07-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=10: B店 アルバイト
    {
      storeId: storeB.id,
      name: '加藤さくら',
      email: 'part_b3@example.com',
      phone: '080-6666-7777',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-10-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=11: C店 アルバイト
    {
      storeId: storeC.id,
      name: '吉田拓海',
      email: 'part_c1@example.com',
      phone: '080-7777-8888',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-05-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=12: C店 アルバイト
    {
      storeId: storeC.id,
      name: '松本あかり',
      email: 'part_c2@example.com',
      phone: '080-8888-9999',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-08-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
    // ID=13: C店 アルバイト
    {
      storeId: storeC.id,
      name: '伊藤蓮',
      email: 'part_c3@example.com',
      phone: '080-9999-0000',
      employmentType: 'part_time',
      hourlyRate: 1100,
      joinedAt: '2024-11-01',
      skillLevel: 2,
      role: 'staff',
      canWorkOtherStores: true,
      skills: 'レジ・品出し',
      maxHoursPerWeek: 20,
    },
  ];

  const insertedStaff = await db.insert(staff).values(staffData).returning();
  console.log(`${insertedStaff.length}名のスタッフを作成しました`);

  // 3. 基本勤務可能時間パターンの作成
  console.log('勤務可能時間パターンを作成中...');
  const availabilityData: (typeof availabilityPatterns.$inferInsert)[] = [];

  for (const s of insertedStaff) {
    if (s.employmentType === 'employee') {
      // 社員・店長・オーナーは全日フルタイム可能
      for (let day = 0; day < 7; day++) {
        availabilityData.push({
          staffId: s.id,
          dayOfWeek: day,
          startTime: '00:00',
          endTime: '23:30',
        });
      }
    } else {
      // アルバイト: 平日夕方（17:00〜22:00）、土日は日中〜夜（9:00〜22:00）
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
            startTime: '17:00',
            endTime: '22:00',
          });
        }
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
