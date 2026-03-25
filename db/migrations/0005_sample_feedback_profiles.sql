CREATE TABLE IF NOT EXISTS "sample_feedback_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "sample_conversation_id" text REFERENCES "sample_conversations"("id") ON DELETE set null,
  "conversation_number" integer NOT NULL,
  "created_by" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "feedback_input" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "sample_feedback_entries_survey_id_idx"
  ON "sample_feedback_entries" ("survey_id");
CREATE INDEX IF NOT EXISTS "sample_feedback_entries_conversation_id_idx"
  ON "sample_feedback_entries" ("sample_conversation_id");

CREATE TABLE IF NOT EXISTS "sample_feedback_patches" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "feedback_entry_id" text NOT NULL REFERENCES "sample_feedback_entries"("id") ON DELETE cascade,
  "conversation_number" integer NOT NULL,
  "status" text NOT NULL,
  "patch" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "sample_feedback_patches_survey_id_idx"
  ON "sample_feedback_patches" ("survey_id");
CREATE INDEX IF NOT EXISTS "sample_feedback_patches_entry_id_idx"
  ON "sample_feedback_patches" ("feedback_entry_id");

CREATE TABLE IF NOT EXISTS "survey_conducting_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "mode" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "source_patch_id" text REFERENCES "sample_feedback_patches"("id") ON DELETE set null,
  "profile" jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE INDEX IF NOT EXISTS "survey_conducting_profiles_survey_id_idx"
  ON "survey_conducting_profiles" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_conducting_profiles_mode_idx"
  ON "survey_conducting_profiles" ("survey_id", "mode", "is_active");
