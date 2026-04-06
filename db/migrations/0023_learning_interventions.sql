CREATE TABLE IF NOT EXISTS "learning_interventions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "classroom_id" text NOT NULL REFERENCES "classrooms"("id") ON DELETE cascade,
  "topic_id" text REFERENCES "learning_topics"("id") ON DELETE set null,
  "classroom_student_id" text NOT NULL REFERENCES "classroom_students"("id") ON DELETE cascade,
  "created_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "intervention_type" text DEFAULT 'reteach' NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "priority" text DEFAULT 'medium' NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "learning_interventions_org_idx"
  ON "learning_interventions" ("organization_id");
CREATE INDEX IF NOT EXISTS "learning_interventions_classroom_idx"
  ON "learning_interventions" ("classroom_id");
CREATE INDEX IF NOT EXISTS "learning_interventions_topic_idx"
  ON "learning_interventions" ("topic_id");
CREATE INDEX IF NOT EXISTS "learning_interventions_student_idx"
  ON "learning_interventions" ("classroom_student_id");
CREATE INDEX IF NOT EXISTS "learning_interventions_status_idx"
  ON "learning_interventions" ("status");
