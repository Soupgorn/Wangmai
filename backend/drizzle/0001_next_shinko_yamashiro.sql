CREATE TABLE "schedule_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"mutation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"timing" text NOT NULL,
	"weekday" integer,
	"date" date,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_entry_owner_identity" UNIQUE("id","user_id"),
	CONSTRAINT "schedule_entry_mutation" UNIQUE("user_id","mutation_id"),
	CONSTRAINT "schedule_entry_title" CHECK (length(trim("schedule_entry"."title")) between 1 and 80),
	CONSTRAINT "schedule_entry_kind" CHECK ("schedule_entry"."kind" in ('available', 'busy')),
	CONSTRAINT "schedule_entry_interval" CHECK ("schedule_entry"."start_minute" >= 0 and "schedule_entry"."start_minute" < "schedule_entry"."end_minute" and "schedule_entry"."end_minute" <= 1440),
	CONSTRAINT "schedule_entry_timing" CHECK (("schedule_entry"."timing" = 'weekly' and "schedule_entry"."weekday" between 1 and 7 and "schedule_entry"."weekday" is not null and "schedule_entry"."date" is null) or ("schedule_entry"."timing" = 'date' and "schedule_entry"."date" is not null and "schedule_entry"."weekday" is null))
);
--> statement-breakpoint
CREATE TABLE "schedule_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recurring_id" uuid NOT NULL,
	"date" date NOT NULL,
	"title" text,
	"kind" text,
	"start_minute" integer,
	"end_minute" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_exception_occurrence" UNIQUE("recurring_id","date"),
	CONSTRAINT "schedule_exception_replacement" CHECK (("schedule_exception"."title" is null and "schedule_exception"."kind" is null and "schedule_exception"."start_minute" is null and "schedule_exception"."end_minute" is null) or ("schedule_exception"."title" is not null and "schedule_exception"."kind" is not null and "schedule_exception"."start_minute" is not null and "schedule_exception"."end_minute" is not null and length(trim("schedule_exception"."title")) between 1 and 80 and "schedule_exception"."kind" in ('available', 'busy') and "schedule_exception"."start_minute" >= 0 and "schedule_exception"."start_minute" < "schedule_exception"."end_minute" and "schedule_exception"."end_minute" <= 1440))
);
--> statement-breakpoint
CREATE TABLE "schedule_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_revision_nonnegative" CHECK ("schedule_preference"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD CONSTRAINT "schedule_exception_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD CONSTRAINT "schedule_exception_recurring_id_user_id_schedule_entry_id_user_id_fk" FOREIGN KEY ("recurring_id","user_id") REFERENCES "public"."schedule_entry"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_preference" ADD CONSTRAINT "schedule_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_entry_owner_idx" ON "schedule_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "schedule_exception_owner_idx" ON "schedule_exception" USING btree ("user_id");