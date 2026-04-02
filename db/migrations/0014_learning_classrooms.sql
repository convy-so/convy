BEGIN;

CREATE TABLE IF NOT EXISTS "classrooms" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "teacher_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text,
  "subject" text,
  "grade_band" text NOT NULL,
  "grade_label" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL
);
CREATE INDEX IF NOT EXISTS "classrooms_organization_id_idx" ON "classrooms" ("organization_id");
CREATE INDEX IF NOT EXISTS "classrooms_teacher_user_id_idx" ON "classrooms" ("teacher_user_id");
CREATE INDEX IF NOT EXISTS "classrooms_grade_band_idx" ON "classrooms" ("grade_band");

CREATE TABLE IF NOT EXISTS "classroom_students" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classroom_id" text NOT NULL REFERENCES "classrooms"("id") ON DELETE cascade,
  "user_id" text REFERENCES "users"("id") ON DELETE set null,
  "invited_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "invite_status" text DEFAULT 'pending' NOT NULL,
  "onboarding_status" text DEFAULT 'interest_profile_pending' NOT NULL,
  "last_active_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "classroom_students_classroom_id_idx" ON "classroom_students" ("classroom_id");
CREATE INDEX IF NOT EXISTS "classroom_students_user_id_idx" ON "classroom_students" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "classroom_students_classroom_email_unique" ON "classroom_students" ("classroom_id", "email");

CREATE TABLE IF NOT EXISTS "learning_topics" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classroom_id" text NOT NULL REFERENCES "classrooms"("id") ON DELETE cascade,
  "created_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text,
  "subject" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "opening_preference" text DEFAULT 'auto' NOT NULL,
  "source_boundary" jsonb NOT NULL,
  "learning_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_material_sync_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "learning_topics_classroom_id_idx" ON "learning_topics" ("classroom_id");
CREATE INDEX IF NOT EXISTS "learning_topics_created_by_user_id_idx" ON "learning_topics" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "learning_topics_status_idx" ON "learning_topics" ("status");

CREATE TABLE IF NOT EXISTS "topic_materials" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "topic_id" text NOT NULL REFERENCES "learning_topics"("id") ON DELETE cascade,
  "uploaded_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text,
  "material_kind" text NOT NULL,
  "storage_bucket" text,
  "storage_path" text,
  "public_url" text,
  "mime_type" text NOT NULL,
  "size_bytes" integer,
  "extraction_status" text DEFAULT 'pending' NOT NULL,
  "indexing_status" text DEFAULT 'pending' NOT NULL,
  "extracted_text" text
);
CREATE INDEX IF NOT EXISTS "topic_materials_topic_id_idx" ON "topic_materials" ("topic_id");
CREATE INDEX IF NOT EXISTS "topic_materials_uploaded_by_user_id_idx" ON "topic_materials" ("uploaded_by_user_id");

CREATE TABLE IF NOT EXISTS "student_interest_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classroom_student_id" text NOT NULL UNIQUE REFERENCES "classroom_students"("id") ON DELETE cascade,
  "profile" jsonb NOT NULL,
  "visibility" text DEFAULT 'private_to_student_and_agent' NOT NULL,
  "last_refreshed_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "student_interest_profiles_student_id_idx" ON "student_interest_profiles" ("classroom_student_id");

CREATE TABLE IF NOT EXISTS "learning_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "topic_id" text NOT NULL REFERENCES "learning_topics"("id") ON DELETE cascade,
  "classroom_student_id" text NOT NULL REFERENCES "classroom_students"("id") ON DELETE cascade,
  "session_type" text NOT NULL,
  "session_status" text DEFAULT 'active' NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb,
  "opening_plan" jsonb,
  "summary" text,
  "completed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "learning_sessions_topic_id_idx" ON "learning_sessions" ("topic_id");
CREATE INDEX IF NOT EXISTS "learning_sessions_student_id_idx" ON "learning_sessions" ("classroom_student_id");
CREATE INDEX IF NOT EXISTS "learning_sessions_type_idx" ON "learning_sessions" ("session_type");

CREATE TABLE IF NOT EXISTS "learning_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "session_id" text NOT NULL REFERENCES "learning_sessions"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "learning_messages_session_id_idx" ON "learning_messages" ("session_id");

CREATE TABLE IF NOT EXISTS "student_progress_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "topic_id" text NOT NULL REFERENCES "learning_topics"("id") ON DELETE cascade,
  "classroom_student_id" text NOT NULL REFERENCES "classroom_students"("id") ON DELETE cascade,
  "generated_from_session_id" text REFERENCES "learning_sessions"("id") ON DELETE set null,
  "mastery_percent" integer DEFAULT 0 NOT NULL,
  "report" jsonb NOT NULL,
  "visibility" text DEFAULT 'teacher_only' NOT NULL
);
CREATE INDEX IF NOT EXISTS "student_progress_reports_topic_id_idx" ON "student_progress_reports" ("topic_id");
CREATE INDEX IF NOT EXISTS "student_progress_reports_student_id_idx" ON "student_progress_reports" ("classroom_student_id");

COMMIT;
