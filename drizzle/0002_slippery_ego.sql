CREATE TYPE "public"."document_kind" AS ENUM('REGISTRATION', 'INSURANCE', 'INSPECTION', 'EMISSIONS', 'WARRANTY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."due_mode" AS ENUM('READING', 'DATE', 'EITHER');--> statement-breakpoint
CREATE TABLE "entry_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"name" text NOT NULL,
	"part_number" text,
	"qty" numeric(9, 2),
	"unit_cost" numeric(10, 2),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"entry_id" uuid,
	"done_on" date NOT NULL,
	"reading_ticks" bigint,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" "document_kind" DEFAULT 'OTHER' NOT NULL,
	"title" text NOT NULL,
	"provider" text,
	"reference" text,
	"starts_on" date,
	"expires_on" date,
	"expires_at_reading_ticks" bigint,
	"renew_every_months" integer,
	"cost" numeric(10, 2),
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_attachments" ALTER COLUMN "entry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "entry_attachments" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_attachments" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD COLUMN "due_mode" "due_mode" DEFAULT 'EITHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD COLUMN "last_done_on" date;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD COLUMN "last_done_reading_ticks" bigint;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD COLUMN "snoozed_until" date;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "photo_attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_parts" ADD CONSTRAINT "entry_parts_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_completions" ADD CONSTRAINT "service_completions_reminder_id_service_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."service_reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_completions" ADD CONSTRAINT "service_completions_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_completions" ADD CONSTRAINT "service_completions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parts_entry_idx" ON "entry_parts" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "completions_reminder_idx" ON "service_completions" USING btree ("reminder_id");--> statement-breakpoint
CREATE INDEX "completions_entry_idx" ON "service_completions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "documents_vehicle_idx" ON "vehicle_documents" USING btree ("vehicle_id");--> statement-breakpoint
ALTER TABLE "entry_attachments" ADD CONSTRAINT "entry_attachments_document_id_vehicle_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."vehicle_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_attachments" ADD CONSTRAINT "entry_attachments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_document_idx" ON "entry_attachments" USING btree ("document_id");