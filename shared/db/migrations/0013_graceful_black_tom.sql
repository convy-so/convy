ALTER TABLE "learning_material_embeddings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "learning_material_embeddings" CASCADE;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" DROP CONSTRAINT "topic_material_upload_attempts_stage_check";--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "previous_attempt_id" text;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "user_message" text;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "internal_error" text;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "retryable" boolean;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_previous_attempt_id_topic_material_upload_attempts_id_fk" FOREIGN KEY ("previous_attempt_id") REFERENCES "public"."topic_material_upload_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_previous_attempt_id_idx" ON "topic_material_upload_attempts" USING btree ("previous_attempt_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_failed_at_idx" ON "topic_material_upload_attempts" USING btree ("failed_at");--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_stage_check" CHECK ("topic_material_upload_attempts"."stage" in ('upload', 'extraction', 'review', 'analysis', 'indexing', 'pack_build'));