CREATE TYPE "public"."conversation_mode" AS ENUM('text', 'voice');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'fr', 'de');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('draft', 'sample_review', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "conversation_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text NOT NULL,
	"insights" jsonb NOT NULL,
	"key_findings" text
);
--> statement-breakpoint
CREATE TABLE "sample_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"conversation_number" integer NOT NULL,
	"messages" jsonb NOT NULL,
	"feedback" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sample_conversations_survey_number_unique" UNIQUE("survey_id","conversation_number")
);
--> statement-breakpoint
CREATE TABLE "survey_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"overall_summary" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"total_conversations" integer DEFAULT 0 NOT NULL,
	"average_conversation_length" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now(),
	CONSTRAINT "survey_analytics_survey_id_unique" UNIQUE("survey_id")
);
--> statement-breakpoint
CREATE TABLE "survey_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"participant_id" text,
	"raw_conversation" jsonb NOT NULL,
	"summary" text,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"goal" text NOT NULL,
	"type" text NOT NULL,
	"information" text NOT NULL,
	"required_questions" jsonb NOT NULL,
	"metrics" jsonb DEFAULT '[]'::jsonb,
	"status" "survey_status" DEFAULT 'draft' NOT NULL,
	"shareable_link" text,
	"participant_limit" integer DEFAULT 50 NOT NULL,
	"current_participants" integer DEFAULT 0 NOT NULL,
	"sample_conversation_count" integer DEFAULT 0 NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"conversation_mode" "conversation_mode" DEFAULT 'text' NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	CONSTRAINT "surveys_shareable_link_unique" UNIQUE("shareable_link")
);
--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_conversation_id_survey_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."survey_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_conversations" ADD CONSTRAINT "sample_conversations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_analytics" ADD CONSTRAINT "survey_analytics_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_conversations" ADD CONSTRAINT "survey_conversations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_insights_conversation_id_idx" ON "conversation_insights" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "sample_conversations_survey_id_idx" ON "sample_conversations" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_analytics_survey_id_idx" ON "survey_analytics" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_conversations_survey_id_idx" ON "survey_conversations" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_conversations_completed_idx" ON "survey_conversations" USING btree ("completed");--> statement-breakpoint
CREATE INDEX "surveys_user_id_idx" ON "surveys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "surveys_shareable_link_idx" ON "surveys" USING btree ("shareable_link");--> statement-breakpoint
CREATE INDEX "surveys_status_idx" ON "surveys" USING btree ("status");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "username";