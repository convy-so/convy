BEGIN;

ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "program_id" text;

CREATE TABLE IF NOT EXISTS "survey_briefs" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL UNIQUE REFERENCES "surveys"("id") ON DELETE cascade,
  "version" integer DEFAULT 1 NOT NULL,
  "program_id" text NOT NULL,
  "brief" jsonb NOT NULL,
  "completeness_status" text DEFAULT 'draft' NOT NULL,
  "approval_state" text DEFAULT 'pending' NOT NULL,
  "missing_fields" text[] DEFAULT '{}'::text[] NOT NULL,
  "validation_notes" text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE INDEX IF NOT EXISTS "survey_briefs_survey_id_idx" ON "survey_briefs" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_briefs_program_id_idx" ON "survey_briefs" ("program_id");

CREATE TABLE IF NOT EXISTS "survey_coverage_plans" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "version" integer DEFAULT 1 NOT NULL,
  "plan" jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);
CREATE INDEX IF NOT EXISTS "survey_coverage_plans_survey_id_idx" ON "survey_coverage_plans" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_coverage_plans_active_idx" ON "survey_coverage_plans" ("survey_id", "is_active");

CREATE TABLE IF NOT EXISTS "survey_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "session_type" text NOT NULL,
  "session_status" text DEFAULT 'active' NOT NULL,
  "source_conversation_id" text,
  "language" text DEFAULT 'en' NOT NULL,
  "respondent_id" text,
  "respondent_role" text,
  "session_state" jsonb NOT NULL,
  "summary" text,
  "completed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "survey_sessions_survey_id_idx" ON "survey_sessions" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_sessions_type_idx" ON "survey_sessions" ("survey_id", "session_type");
CREATE INDEX IF NOT EXISTS "survey_sessions_source_idx" ON "survey_sessions" ("source_conversation_id");

CREATE TABLE IF NOT EXISTS "survey_turns" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "session_id" text NOT NULL REFERENCES "survey_sessions"("id") ON DELETE cascade,
  "turn_index" integer NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "source_message_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "survey_turns_session_id_idx" ON "survey_turns" ("session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "survey_turns_session_turn_unique" ON "survey_turns" ("session_id", "turn_index");

CREATE TABLE IF NOT EXISTS "survey_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "session_id" text NOT NULL REFERENCES "survey_sessions"("id") ON DELETE cascade,
  "turn_id" text REFERENCES "survey_turns"("id") ON DELETE set null,
  "node_id" text NOT NULL,
  "evidence_type" text NOT NULL,
  "excerpt" text NOT NULL,
  "sentiment" text,
  "reliability" integer DEFAULT 70 NOT NULL,
  "metadata" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "survey_evidence_survey_id_idx" ON "survey_evidence" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_evidence_session_id_idx" ON "survey_evidence" ("session_id");
CREATE INDEX IF NOT EXISTS "survey_evidence_node_id_idx" ON "survey_evidence" ("node_id");

CREATE TABLE IF NOT EXISTS "survey_session_insights" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "session_id" text NOT NULL UNIQUE REFERENCES "survey_sessions"("id") ON DELETE cascade,
  "insight" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "survey_session_insights_survey_id_idx" ON "survey_session_insights" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_session_insights_session_id_idx" ON "survey_session_insights" ("session_id");

CREATE TABLE IF NOT EXISTS "survey_analytics_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "version" integer DEFAULT 1 NOT NULL,
  "snapshot" jsonb NOT NULL,
  "is_latest" boolean DEFAULT true NOT NULL
);
CREATE INDEX IF NOT EXISTS "survey_analytics_snapshots_survey_id_idx" ON "survey_analytics_snapshots" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_analytics_snapshots_latest_idx" ON "survey_analytics_snapshots" ("survey_id", "is_latest");

CREATE TABLE IF NOT EXISTS "trace_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text REFERENCES "surveys"("id") ON DELETE cascade,
  "session_id" text REFERENCES "survey_sessions"("id") ON DELETE cascade,
  "trace_type" text NOT NULL,
  "status" text DEFAULT 'ok' NOT NULL,
  "payload" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "trace_runs_survey_id_idx" ON "trace_runs" ("survey_id");
CREATE INDEX IF NOT EXISTS "trace_runs_session_id_idx" ON "trace_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "trace_runs_type_idx" ON "trace_runs" ("trace_type");

COMMIT;
