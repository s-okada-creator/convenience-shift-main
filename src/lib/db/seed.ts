import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  stores,
  staff,
  availabilityPatterns,
  shiftRequirements,
  shifts,
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

  // 0. 既存データをクリア（順序はFK制約に注意）
  console.log('既存データをクリア中...');
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

  // 2. スタッフデータの作成（各店舗20名: 社員3名 + アルバイト17名）
  console.log('スタッフデータを作成中...');
  const staffData: (typeof staff.$inferInsert)[] = [];

  // アルバイトの属性パターン
  type StaffProfile = {
    category: string;  // 高校生 / 大学生 / フリーター / 主婦 / Wワーク
    skills: string;
    maxHoursPerWeek: number;
    canWorkOtherStores: boolean;
    hourlyRate: number;
  };

  // 各店舗のアルバイト構成（リアルなコンビニ想定）
  const partTimeProfiles: StaffProfile[] = [
    // 高校生（3名）- 他店NG、週15h上限
    { category: '高校生', skills: 'レジ', maxHoursPerWeek: 15, canWorkOtherStores: false, hourlyRate: 1070 },
    { category: '高校生', skills: 'レジ・品出し', maxHoursPerWeek: 15, canWorkOtherStores: false, hourlyRate: 1070 },
    { category: '高校生', skills: 'レジ', maxHoursPerWeek: 12, canWorkOtherStores: false, hourlyRate: 1070 },
    // 大学生（5名）- 他店OK多め、週20〜28h
    { category: '大学生', skills: 'レジ・調理・発注', maxHoursPerWeek: 28, canWorkOtherStores: true, hourlyRate: 1150 },
    { category: '大学生', skills: 'レジ・品出し', maxHoursPerWeek: 20, canWorkOtherStores: true, hourlyRate: 1100 },
    { category: '大学生', skills: 'レジ・調理', maxHoursPerWeek: 24, canWorkOtherStores: true, hourlyRate: 1120 },
    { category: '大学生', skills: 'レジ', maxHoursPerWeek: 20, canWorkOtherStores: false, hourlyRate: 1100 },
    { category: '大学生', skills: 'レジ・品出し・検品', maxHoursPerWeek: 24, canWorkOtherStores: true, hourlyRate: 1130 },
    // フリーター（4名）- 他店OK、週30〜40h
    { category: 'フリーター', skills: '調理・レジ・発注・深夜OK', maxHoursPerWeek: 40, canWorkOtherStores: true, hourlyRate: 1200 },
    { category: 'フリーター', skills: 'レジ・品出し・調理・深夜OK', maxHoursPerWeek: 36, canWorkOtherStores: true, hourlyRate: 1180 },
    { category: 'フリーター', skills: 'レジ・調理・清掃', maxHoursPerWeek: 32, canWorkOtherStores: true, hourlyRate: 1150 },
    { category: 'フリーター', skills: '調理・発注・深夜OK', maxHoursPerWeek: 40, canWorkOtherStores: true, hourlyRate: 1250 },
    // 主婦・主夫（3名）- 日中メイン、他店は一部OK
    { category: '主婦', skills: 'レジ・調理・品出し', maxHoursPerWeek: 20, canWorkOtherStores: true, hourlyRate: 1100 },
    { category: '主婦', skills: 'レジ・品出し', maxHoursPerWeek: 16, canWorkOtherStores: false, hourlyRate: 1080 },
    { category: '主婦', skills: 'レジ・調理・清掃', maxHoursPerWeek: 24, canWorkOtherStores: true, hourlyRate: 1120 },
    // Wワーク（2名）- 限定的
    { category: 'Wワーク', skills: 'レジ・深夜OK', maxHoursPerWeek: 16, canWorkOtherStores: false, hourlyRate: 1300 },
    { category: 'Wワーク', skills: 'レジ・品出し・深夜OK', maxHoursPerWeek: 20, canWorkOtherStores: true, hourlyRate: 1280 },
  ];

  for (const store of insertedStores) {
    // オーナー（A店のみ）
    if (store.id === insertedStores[0].id) {
      staffData.push({
        storeId: store.id,
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
      });
    }

    // 店長（各店舗1名）
    const managerNames = ['寝屋川A店長', '寝屋川B店長', '寝屋川C店長'];
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
      canWorkOtherStores: true,
      skills: '全業務・店舗管理',
      maxHoursPerWeek: 50,
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
        canWorkOtherStores: true,
        skills: '調理・レジ・発注・深夜OK',
        maxHoursPerWeek: 40,
      });
    }

    // アルバイト（各店舗17名 - リアルな属性付き）
    for (let i = 0; i < partTimeProfiles.length; i++) {
      const profile = partTimeProfiles[i];
      const joinedYear = 2022 + Math.floor(Math.random() * 4);
      const joinedMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');

      staffData.push({
        storeId: store.id,
        name: getRandomName(),
        email: `part_time${store.id}_${i}@example.com`,
        phone: getRandomPhone(),
        employmentType: 'part_time',
        hourlyRate: profile.hourlyRate,
        joinedAt: `${joinedYear}-${joinedMonth}-01`,
        skillLevel: profile.category === '高校生' ? 1 : profile.category === 'フリーター' ? 3 : 2,
        notes: profile.category,
        role: 'staff',
        canWorkOtherStores: profile.canWorkOtherStores,
        skills: profile.skills,
        maxHoursPerWeek: profile.maxHoursPerWeek,
      });
    }
  }

  const insertedStaff = await db.insert(staff).values(staffData).returning();
  console.log(`${insertedStaff.length}名のスタッフを作成しました`);

  // 3. 基本勤務可能時間パターンの作成
  console.log('勤務可能時間パターンを作成中...');
  const availabilityData: (typeof availabilityPatterns.$inferInsert)[] = [];

  for (const s of insertedStaff) {
    const category = s.notes; // 高校生 / 大学生 / フリーター / 主婦 / Wワーク
    const isEmployee = s.employmentType === 'employee';

    if (isEmployee) {
      // 社員・店長・オーナーは全日フルタイム可能
      for (let day = 0; day < 7; day++) {
        availabilityData.push({
          staffId: s.id,
          dayOfWeek: day,
          startTime: '00:00',
          endTime: '23:30',
        });
      }
    } else if (category === '高校生') {
      // 高校生: 平日は放課後（17:00〜21:00）、土日は日中（9:00〜21:00）、22時以降NG
      for (let day = 0; day < 7; day++) {
        if (day === 0 || day === 6) {
          availabilityData.push({ staffId: s.id, dayOfWeek: day, startTime: '09:00', endTime: '21:00' });
        } else {
          availabilityData.push({ staffId: s.id, dayOfWeek: day, startTime: '17:00', endTime: '21:00' });
        }
      }
    } else if (category === '大学生') {
      // 大学生: 平日夕方〜夜（16:00〜22:00）、土日はフレキシブル（9:00〜22:00）
      for (let day = 0; day < 7; day++) {
        if (Math.random() > 0.85) continue; // 週1日くらい休み
        if (day === 0 || day === 6) {
          availabilityData.push({ staffId: s.id, dayOfWeek: day, startTime: '09:00', endTime: '22:00' });
        } else {
          availabilityData.push({ staffId: s.id, dayOfWeek: day, startTime: '16:00', endTime: '22:00' });
        }
      }
    } else if (category === 'フリーター') {
      // フリーター: ほぼ全日OK、深夜もOKな人が多い
      const patterns = [
        { start: '06:00', end: '23:30' }, // ほぼ終日
        { start: '14:00', end: '23:30' }, // 午後〜深夜
        { start: '22:00', end: '23:30' }, // 深夜メイン（前半）
        { start: '00:00', end: '09:00' }, // 深夜メイン（後半）
      ];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      for (let day = 0; day < 7; day++) {
        if (Math.random() > 0.85) continue; // 週1日くらい休み
        availabilityData.push({ staffId: s.id, dayOfWeek: day, startTime: pattern.start, endTime: pattern.end });
      }
    } else if (category === '主婦') {
      // 主婦: 平日日中メイン（9:00〜15:00 or 10:00〜17:00）、土日は休みがち
      const patterns = [
        { start: '09:00', end: '15:00' },
        { start: '10:00', end: '17:00' },
        { start: '09:00', end: '14:00' },
      ];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      for (let day = 0; day < 7; day++) {
        if (day === 0 || day === 6) {
          if (Math.random() > 0.3) continue; // 土日はほぼ休み
        }
        if (Math.random() > 0.8) continue;
        availabilityData.push({ staffId: s.id, dayOfWeek: day, startTime: pattern.start, endTime: pattern.end });
      }
    } else if (category === 'Wワーク') {
      // Wワーク: 深夜帯メインで週3〜4日
      const patterns = [
        { start: '22:00', end: '23:30' },
        { start: '00:00', end: '06:00' },
      ];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      for (let day = 0; day < 7; day++) {
        if (Math.random() > 0.55) continue; // 週3〜4日
        availabilityData.push({ staffId: s.id, dayOfWeek: day, startTime: pattern.start, endTime: pattern.end });
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
