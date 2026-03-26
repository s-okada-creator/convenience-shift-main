import { pgTable, serial, text, integer, timestamp, date, time, boolean, pgEnum, index, jsonb } from 'drizzle-orm/pg-core';

// Enum定義
export const roleEnum = pgEnum('role', ['owner', 'manager', 'staff']);
export const employmentTypeEnum = pgEnum('employment_type', ['employee', 'part_time']);
export const timeOffStatusEnum = pgEnum('time_off_status', ['pending', 'approved', 'rejected']);
export const helpRequestStatusEnum = pgEnum('help_request_status', ['open', 'offered', 'confirmed', 'closed', 'withdrawn']);
export const helpOfferStatusEnum = pgEnum('help_offer_status', ['pending', 'confirmed', 'cancelled', 'rejected']);
export const staffHelpResponseStatusEnum = pgEnum('staff_help_response_status', ['pending', 'confirmed', 'cancelled', 'rejected']);

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
  lineUserId: text('line_user_id'),
  role: roleEnum('role').default('staff').notNull(),
  canWorkOtherStores: boolean('can_work_other_stores').default(false).notNull(),
  skills: text('skills'),
  maxHoursPerWeek: integer('max_hours_per_week'),
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

// ヘルプ要請テーブル
export const helpRequests = pgTable('help_requests', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  requestedBy: integer('requested_by').references(() => staff.id).notNull(),
  needDate: date('need_date').notNull(),
  needStart: time('need_start').notNull(),
  needEnd: time('need_end').notNull(),
  memo: text('memo'),
  offerType: text('offer_type').default('emergency').notNull(), // emergency / proactive
  status: helpRequestStatusEnum('status').default('open').notNull(),
  staffNotified: boolean('staff_notified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('help_requests_store_idx').on(table.storeId),
  index('help_requests_date_idx').on(table.needDate),
  index('help_requests_status_idx').on(table.status),
]);

// ヘルプ申し出テーブル（店舗間）
export const helpOffers = pgTable('help_offers', {
  id: serial('id').primaryKey(),
  requestId: integer('request_id').references(() => helpRequests.id, { onDelete: 'cascade' }).notNull(),
  offeringStoreId: integer('offering_store_id').references(() => stores.id).notNull(),
  staffId: integer('staff_id').references(() => staff.id).notNull(),
  offeredBy: integer('offered_by').references(() => staff.id).notNull(),
  offerStart: time('offer_start').notNull(),
  offerEnd: time('offer_end').notNull(),
  isPartial: boolean('is_partial').default(false).notNull(),
  status: helpOfferStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('help_offers_request_idx').on(table.requestId),
]);

// スタッフ直接申し出テーブル
export const staffHelpResponses = pgTable('staff_help_responses', {
  id: serial('id').primaryKey(),
  requestId: integer('request_id').references(() => helpRequests.id, { onDelete: 'cascade' }).notNull(),
  staffId: integer('staff_id').references(() => staff.id).notNull(),
  offerStart: time('offer_start').notNull(),
  offerEnd: time('offer_end').notNull(),
  isPartial: boolean('is_partial').default(false).notNull(),
  message: text('message'),
  status: staffHelpResponseStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('staff_help_responses_request_idx').on(table.requestId),
  index('staff_help_responses_staff_idx').on(table.staffId),
]);

// 追加勤務希望テーブル（余剰スタッフ事前登録）
export const proactiveOffers = pgTable('proactive_offers', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'cascade' }).notNull(),
  storeId: integer('store_id').references(() => stores.id).notNull(), // 所属店舗
  availableDate: date('available_date').notNull(),
  availableStart: time('available_start').notNull(),
  availableEnd: time('available_end').notNull(),
  memo: text('memo'), // 「どこの店でもOK」等
  status: text('status').default('open').notNull(), // open / accepted / cancelled / expired
  acceptedByStoreId: integer('accepted_by_store_id').references(() => stores.id),
  acceptedBy: integer('accepted_by').references(() => staff.id), // accepting manager
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('proactive_offers_date_idx').on(table.availableDate),
  index('proactive_offers_staff_idx').on(table.staffId),
  index('proactive_offers_status_idx').on(table.status),
]);

// シフト求人ステータス
export const shiftPostingStatusEnum = pgEnum('shift_posting_status', ['open', 'filled', 'closed', 'expired']);
export const shiftApplicationStatusEnum = pgEnum('shift_application_status', ['pending', 'confirmed', 'rejected', 'cancelled']);

// シフト求人テーブル
export const shiftPostings = pgTable('shift_postings', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  postedBy: integer('posted_by').references(() => staff.id).notNull(),
  date: date('date').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  slots: integer('slots').default(1).notNull(), // 募集人数
  filledCount: integer('filled_count').default(0).notNull(), // 確定済み人数
  description: text('description'), // 「レジできる方」等
  status: shiftPostingStatusEnum('status').default('open').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('shift_postings_store_idx').on(table.storeId),
  index('shift_postings_date_idx').on(table.date),
  index('shift_postings_status_idx').on(table.status),
]);

// シフト求人応募テーブル
export const shiftApplications = pgTable('shift_applications', {
  id: serial('id').primaryKey(),
  postingId: integer('posting_id').references(() => shiftPostings.id, { onDelete: 'cascade' }).notNull(),
  staffId: integer('staff_id').references(() => staff.id).notNull(),
  message: text('message'), // 任意メッセージ
  status: shiftApplicationStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('shift_applications_posting_idx').on(table.postingId),
  index('shift_applications_staff_idx').on(table.staffId),
]);

// 通知ログテーブル
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => staff.id).notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('notifications_user_idx').on(table.userId),
  index('notifications_read_idx').on(table.readAt),
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

export type HelpRequest = typeof helpRequests.$inferSelect;
export type NewHelpRequest = typeof helpRequests.$inferInsert;

export type HelpOffer = typeof helpOffers.$inferSelect;
export type NewHelpOffer = typeof helpOffers.$inferInsert;

export type StaffHelpResponse = typeof staffHelpResponses.$inferSelect;
export type NewStaffHelpResponse = typeof staffHelpResponses.$inferInsert;

export type ProactiveOffer = typeof proactiveOffers.$inferSelect;
export type NewProactiveOffer = typeof proactiveOffers.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type ShiftPosting = typeof shiftPostings.$inferSelect;
export type NewShiftPosting = typeof shiftPostings.$inferInsert;
export type ShiftApplication = typeof shiftApplications.$inferSelect;
export type NewShiftApplication = typeof shiftApplications.$inferInsert;
