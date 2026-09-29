CREATE TYPE "public"."guide_container" AS ENUM('yaml', 'md');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('done', 'dont-care');--> statement-breakpoint
CREATE TABLE "category_prefs" (
	"run_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	"tracked" boolean NOT NULL,
	CONSTRAINT "category_prefs_run_id_category_id_pk" PRIMARY KEY("run_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "guide_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"filename" text NOT NULL,
	"container" "guide_container" NOT NULL,
	"source" text NOT NULL,
	"source_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"model" jsonb NOT NULL,
	"model_version" integer NOT NULL,
	"game" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_versions_run_id_version_unique" UNIQUE("run_id","version")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"current_version" integer NOT NULL,
	"pinned_section_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_name_length" CHECK (char_length("runs"."name") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "section_progress" (
	"run_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"cleared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_progress_run_id_section_id_pk" PRIMARY KEY("run_id","section_id")
);
--> statement-breakpoint
CREATE TABLE "task_progress" (
	"run_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"state" "task_state" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_progress_run_id_task_id_pk" PRIMARY KEY("run_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_prefs" ADD CONSTRAINT "category_prefs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_versions" ADD CONSTRAINT "guide_versions_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_user_id_idx" ON "runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");