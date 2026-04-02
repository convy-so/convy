BEGIN;

CREATE TABLE IF NOT EXISTS "learning_interactions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classroom_student_id" text NOT NULL REFERENCES "classroom_students"("id") ON DELETE cascade,
  "topic_id" text REFERENCES "learning_topics"("id") ON DELETE cascade,
  "session_id" text REFERENCES "learning_sessions"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "interaction_type" text NOT NULL,
  "phase_id" integer,
  "phase_type" text,
  "concept_key" text,
  "content" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "learning_interactions_student_id_idx"
  ON "learning_interactions" ("classroom_student_id");
CREATE INDEX IF NOT EXISTS "learning_interactions_topic_id_idx"
  ON "learning_interactions" ("topic_id");
CREATE INDEX IF NOT EXISTS "learning_interactions_session_id_idx"
  ON "learning_interactions" ("session_id");
CREATE INDEX IF NOT EXISTS "learning_interactions_phase_idx"
  ON "learning_interactions" ("session_id", "phase_id");

COMMIT;
