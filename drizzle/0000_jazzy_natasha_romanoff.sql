CREATE TYPE "public"."employment_type" AS ENUM('employee', 'part_time');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."time_off_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "availability_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"time_slot" time NOT NULL,
	"required_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_help_from_other_store" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"employment_type" "employment_type" NOT NULL,
	"hourly_rate" integer NOT NULL,
	"joined_at" date NOT NULL,
	"skill_level" integer DEFAULT 1,
	"notes" text,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"date" date NOT NULL,
	"status" time_off_status DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_patterns" ADD CONSTRAINT "availability_patterns_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requirements" ADD CONSTRAINT "shift_requirements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_staff_idx" ON "availability_patterns" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "requirements_store_day_idx" ON "shift_requirements" USING btree ("store_id","day_of_week");--> statement-breakpoint
CREATE INDEX "shifts_store_date_idx" ON "shifts" USING btree ("store_id","date");--> statement-breakpoint
CREATE INDEX "shifts_staff_idx" ON "shifts" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_store_idx" ON "staff" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "time_off_staff_idx" ON "time_off_requests" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "time_off_date_idx" ON "time_off_requests" USING btree ("date");