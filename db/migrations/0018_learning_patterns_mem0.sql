ALTER TABLE "learning_topics"
ADD COLUMN IF NOT EXISTS "subject_key" text DEFAULT 'general' NOT NULL;

ALTER TABLE "learning_topics"
ADD COLUMN IF NOT EXISTS "subject_label" text DEFAULT 'General' NOT NULL;

UPDATE "learning_topics"
SET
  "subject_key" = COALESCE(NULLIF(lower(regexp_replace(COALESCE("subject", 'general'), '[^a-zA-Z0-9]+', '-', 'g')), ''), 'general'),
  "subject_label" = COALESCE(NULLIF("subject", ''), 'General')
WHERE "subject_key" = 'general' OR "subject_label" = 'General';

CREATE INDEX IF NOT EXISTS "learning_topics_subject_key_idx"
  ON "learning_topics" ("subject_key");

CREATE TABLE IF NOT EXISTS "student_learning_pattern_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "student_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "scope_type" text NOT NULL,
  "scope_ref" text NOT NULL,
  "subject_key" text,
  "subject_label" text,
  "pattern_confidence_percent" integer DEFAULT 0 NOT NULL,
  "confidence_by_dimension" jsonb DEFAULT '{}'::jsonb,
  "profile" jsonb NOT NULL,
  "teacher_summary" text DEFAULT '' NOT NULL,
  "student_summary" text DEFAULT '' NOT NULL,
  "engagement_trend" text DEFAULT 'stable' NOT NULL,
  "last_analyzed_source_type" text,
  "last_analyzed_source_id" text,
  "last_mem0_sync_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "student_learning_pattern_profiles_org_idx"
  ON "student_learning_pattern_profiles" ("organization_id");

CREATE INDEX IF NOT EXISTS "student_learning_pattern_profiles_user_idx"
  ON "student_learning_pattern_profiles" ("student_user_id");

CREATE INDEX IF NOT EXISTS "student_learning_pattern_profiles_subject_idx"
  ON "student_learning_pattern_profiles" ("subject_key");

CREATE UNIQUE INDEX IF NOT EXISTS "student_learning_pattern_profiles_scope_unique"
  ON "student_learning_pattern_profiles" ("organization_id", "student_user_id", "scope_type", "scope_ref");

CREATE TABLE IF NOT EXISTS "student_learning_pattern_analyses" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "student_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "classroom_student_id" text REFERENCES "classroom_students"("id") ON DELETE set null,
  "topic_id" text REFERENCES "learning_topics"("id") ON DELETE set null,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "mem0_references" jsonb DEFAULT '[]'::jsonb,
  "profile_scope_refs" jsonb DEFAULT '[]'::jsonb,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "student_learning_pattern_analyses_org_idx"
  ON "student_learning_pattern_analyses" ("organization_id");

CREATE INDEX IF NOT EXISTS "student_learning_pattern_analyses_user_idx"
  ON "student_learning_pattern_analyses" ("student_user_id");

CREATE INDEX IF NOT EXISTS "student_learning_pattern_analyses_topic_idx"
  ON "student_learning_pattern_analyses" ("topic_id");

CREATE UNIQUE INDEX IF NOT EXISTS "student_learning_pattern_analyses_source_unique"
  ON "student_learning_pattern_analyses" ("source_type", "source_id");
