CREATE TYPE "public"."expert_invitation_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "expert_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_user_id" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" "expert_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "expert_invitations_email_lowercase_check" CHECK (lower("expert_invitations"."invited_email") = "expert_invitations"."invited_email")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" text,
	CONSTRAINT "courses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "topic_material_upload_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_attempt_id" text,
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
	"user_message" text,
	"internal_error" text,
	"error_code" text,
	"retryable" boolean,
	"queued_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_message" text,
	"material_id" text,
	CONSTRAINT "topic_material_upload_attempts_status_check" CHECK ("topic_material_upload_attempts"."status" in ('queued', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "topic_material_upload_attempts_stage_check" CHECK ("topic_material_upload_attempts"."stage" in ('upload', 'extraction', 'review', 'analysis', 'indexing', 'pack_build'))
);
--> statement-breakpoint
ALTER TABLE "expert_runtime_models" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_material_embeddings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_model_analyses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_model_snapshots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_models" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "expert_runtime_models" CASCADE;--> statement-breakpoint
DROP TABLE "learning_material_embeddings" CASCADE;--> statement-breakpoint
DROP TABLE "student_model_analyses" CASCADE;--> statement-breakpoint
DROP TABLE "student_model_snapshots" CASCADE;--> statement-breakpoint
DROP TABLE "student_models" CASCADE;--> statement-breakpoint
ALTER TABLE "expert_frameworks" DROP CONSTRAINT "expert_frameworks_classroom_id_classrooms_id_fk";
--> statement-breakpoint
ALTER TABLE "expert_frameworks" DROP CONSTRAINT "expert_frameworks_topic_id_learning_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "learning_sessions" ALTER COLUMN "state" SET DEFAULT '{"topicId":null,"topicTitle":"","frameworkVersionId":null,"activeFrameworkSnapshot":null,"groundingPackVersion":0,"contentScopeSnapshot":null,"recentMessageSummary":"","recentEvidence":[],"tutorNotes":[],"turnCount":0,"reportReady":false,"completed":false,"completionRequestedAt":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD COLUMN "course_id" text;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD COLUMN "course_id" text;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD COLUMN "course_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD COLUMN "subject_key" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD COLUMN "course_id" text;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "course_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "readiness_analysis" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "readiness_source_hash" text;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "readiness_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "topic_grounding_pack" jsonb;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "topic_grounding_pack_built_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_materials" ADD COLUMN "source_document" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "topic_materials" ADD COLUMN "grounding_map" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "topic_materials" ADD COLUMN "coverage_review" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "expert_invitations" ADD CONSTRAINT "expert_invitations_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_invitations" ADD CONSTRAINT "expert_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_previous_attempt_id_topic_material_upload_attempts_id_fk" FOREIGN KEY ("previous_attempt_id") REFERENCES "public"."topic_material_upload_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_material_id_topic_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."topic_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_user_id_idx" ON "expert_invitations" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_by_user_id_idx" ON "expert_invitations" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_email_idx" ON "expert_invitations" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "expert_invitations_status_idx" ON "expert_invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_invitations_pending_email_unique" ON "expert_invitations" USING btree ("invited_email") WHERE "expert_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "courses_key_idx" ON "courses" USING btree ("key");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courses_created_by_user_id_idx" ON "courses" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_topic_id_idx" ON "topic_material_upload_attempts" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_batch_id_idx" ON "topic_material_upload_attempts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_status_idx" ON "topic_material_upload_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_previous_attempt_id_idx" ON "topic_material_upload_attempts" USING btree ("previous_attempt_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_failed_at_idx" ON "topic_material_upload_attempts" USING btree ("failed_at");--> statement-breakpoint
ALTER TABLE "expert_guidance_packs" ADD CONSTRAINT "expert_guidance_packs_active_version_id_expert_guidance_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."expert_guidance_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD CONSTRAINT "expert_conflicts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD CONSTRAINT "expert_crystallizations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_active_version_id_expert_framework_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."expert_framework_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_students_classroom_user_unique" ON "classroom_students" USING btree ("classroom_id","user_id") WHERE "classroom_students"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "expert_conflicts_course_idx" ON "expert_conflicts" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_crystallizations_course_idx" ON "expert_crystallizations" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_frameworks_course_id_idx" ON "expert_frameworks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_frameworks_subject_key_idx" ON "expert_frameworks" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "expert_review_cases_course_idx" ON "expert_review_cases" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "learning_topics_course_id_idx" ON "learning_topics" USING btree ("course_id");--> statement-breakpoint
ALTER TABLE "learning_topics" DROP COLUMN "subject_label";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_check" CHECK (lower("users"."email") = "users"."email");--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_email_lowercase_check" CHECK (lower("classroom_invitations"."invited_email") = "classroom_invitations"."invited_email");--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_email_lowercase_check" CHECK (lower("classroom_students"."email") = "classroom_students"."email");