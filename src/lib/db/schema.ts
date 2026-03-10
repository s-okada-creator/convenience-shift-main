import { pgTable, serial, text, integer, timestamp, date, time, boolean, pgEnum, index } from 'drizzle-orm/pg-core';

// Enum定義
export const roleEnum = pgEnum('role', ['owner', 'manager', 'staff']);
export const employmentTypeEnum = pgEnum('employment_type', ['employee', 'part_time']);
export const timeOffStatusEnum = pgEnum('time_off_status', ['pending', 'approved', 'rejected']);

// 店舗テーブル
export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// スタッフテーブル
export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  employmentType: employmentTypeEnum('employment_type').notNull(),
  hourlyRate: integer('hourly_rate').notNull(),
  joinedAt: date('joined_at').notNull(),
  skillLevel: integer('skill_level').default(1),
  notes: text('notes'),
  role: roleEnum('role').default('staff').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('staff_store_idx').on(table.storeId),
]);

// 基本勤務可能時間テーブル
export const availabilityPatterns = pgTable('availability_patterns', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'cascade' }).notNull(),
  dayOfWeek: integer('day_of_week').notNull(), // 0-6 (日〜土)
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
}, (table) => [
  index('availability_staff_idx').on(table.staffId),
]);

// 休み希望テーブル
export const timeOffRequests = pgTable('time_off_requests', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'cascade' }).notNull(),
  date: date('date').notNull(),
  status: timeOffStatusEnum('status').default('pending').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('time_off_staff_idx').on(table.staffId),
  index('time_off_date_idx').on(table.date),
]);

// シフト必要人数テーブル
export const shiftRequirements = pgTable('shift_requirements', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  dayOfWeek: integer('day_of_week').notNull(), // 0-6
  timeSlot: time('time_slot').notNull(), // 30分単位 ("09:00", "09:30", ...)
  requiredCount: integer('required_count').notNull(),
}, (table) => [
  index('requirements_store_day_idx').on(table.storeId, table.dayOfWeek),
]);

// シフトテーブル
export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'cascade' }).notNull(),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  date: date('date').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  isHelpFromOtherStore: boolean('is_help_from_other_store').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('shifts_store_date_idx').on(table.storeId, table.date),
  index('shifts_staff_idx').on(table.staffId),
]);

// 型エクスポート
export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;

export type AvailabilityPattern = typeof availabilityPatterns.$inferSelect;
export type NewAvailabilityPattern = typeof availabilityPatterns.$inferInsert;

export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type NewTimeOffRequest = typeof timeOffRequests.$inferInsert;

export type ShiftRequirement = typeof shiftRequirements.$inferSelect;
export type NewShiftRequirement = typeof shiftRequirements.$inferInsert;

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
