ALTER TABLE "learning_topics" ADD COLUMN "readiness_analysis" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "readiness_source_hash" text;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "readiness_generated_at" timestamp with time zone;