CREATE TABLE "topic_material_upload_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"title" text,
	"description" text,
	"mime_type" text,
	"size_bytes" integer,
	"storage_bucket" text,
	"storage_path" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'upload' NOT NULL,
	"failure_message" text,
	"material_id" text,
	CONSTRAINT "topic_material_upload_attempts_status_check" CHECK ("topic_material_upload_attempts"."status" in ('queued', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "topic_material_upload_attempts_stage_check" CHECK ("topic_material_upload_attempts"."stage" in ('upload', 'extraction', 'review', 'indexing'))
);
--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_material_id_topic_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."topic_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_topic_id_idx" ON "topic_material_upload_attempts" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_batch_id_idx" ON "topic_material_upload_attempts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_status_idx" ON "topic_material_upload_attempts" USING btree ("status");