ALTER TABLE "user_emails" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "survey_outbox" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "survey_realtime_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_keys" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voice_chunks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voice_quality_metrics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_media_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_emails" CASCADE;--> statement-breakpoint
DROP TABLE "survey_outbox" CASCADE;--> statement-breakpoint
DROP TABLE "survey_realtime_events" CASCADE;--> statement-breakpoint
DROP TABLE "idempotency_keys" CASCADE;--> statement-breakpoint
DROP TABLE "voice_chunks" CASCADE;--> statement-breakpoint
DROP TABLE "voice_quality_metrics" CASCADE;--> statement-breakpoint
DROP TABLE "external_media_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "teaching_media_usage_events" DROP CONSTRAINT "teaching_media_usage_events_external_media_id_external_media_cache_id_fk";
--> statement-breakpoint
ALTER TABLE "teaching_media_usage_events" DROP COLUMN "external_media_id";