DO $$
BEGIN
  ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'expert';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ai_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "feature" text NOT NULL,
  "run_kind" text DEFAULT 'generation' NOT NULL,
  "scenario_type" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE set null,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE set null,
  "actor_role" text,
  "resource_type" text,
  "resource_id" text,
  "model_provider" text,
  "model_name" text,
  "prompt_version_id" text,
  "expert_guidance_version_id" text,
  "user_overlay_version_id" text,
  "failure_ontology_version" text,
  "temperature_milli" integer,
  "max_tokens" integer,
  "output_text" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "error_message" text,
  "latency_ms" integer,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "total_tokens" integer,
  "estimated_cost_usd" numeric(12, 6)
);

CREATE INDEX IF NOT EXISTS "ai_runs_feature_idx" ON "ai_runs" ("feature");
CREATE INDEX IF NOT EXISTS "ai_runs_status_idx" ON "ai_runs" ("status");
CREATE INDEX IF NOT EXISTS "ai_runs_user_id_idx" ON "ai_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "ai_runs_org_id_idx" ON "ai_runs" ("organization_id");
CREATE INDEX IF NOT EXISTS "ai_runs_resource_idx" ON "ai_runs" ("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "ai_runs_created_at_idx" ON "ai_runs" ("created_at");

CREATE TABLE IF NOT EXISTS "ai_steps" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "ai_run_id" text NOT NULL REFERENCES "ai_runs"("id") ON DELETE cascade,
  "step_key" text NOT NULL,
  "step_type" text NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "started_at_iso" text,
  "completed_at_iso" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "output_summary" text,
  "error_message" text,
  "latency_ms" integer
);

CREATE INDEX IF NOT EXISTS "ai_steps_run_id_idx" ON "ai_steps" ("ai_run_id");
CREATE INDEX IF NOT EXISTS "ai_steps_step_type_idx" ON "ai_steps" ("step_type");

CREATE TABLE IF NOT EXISTS "ai_tool_calls" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "ai_run_id" text NOT NULL REFERENCES "ai_runs"("id") ON DELETE cascade,
  "tool_name" text NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb,
  "output" jsonb DEFAULT '{}'::jsonb,
  "error_message" text,
  "latency_ms" integer
);

CREATE INDEX IF NOT EXISTS "ai_tool_calls_run_id_idx" ON "ai_tool_calls" ("ai_run_id");
CREATE INDEX IF NOT EXISTS "ai_tool_calls_tool_name_idx" ON "ai_tool_calls" ("tool_name");

CREATE TABLE IF NOT EXISTS "ai_context_records" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "ai_run_id" text NOT NULL REFERENCES "ai_runs"("id") ON DELETE cascade,
  "layer_kind" text NOT NULL,
  "layer_label" text NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "source_type" text,
  "source_id" text,
  "version_id" text,
  "token_estimate" integer,
  "content_preview" text,
  "payload" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "ai_context_records_run_id_idx" ON "ai_context_records" ("ai_run_id");
CREATE INDEX IF NOT EXISTS "ai_context_records_layer_idx" ON "ai_context_records" ("layer_kind", "priority");

CREATE TABLE IF NOT EXISTS "ai_feedback_events" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "ai_run_id" text REFERENCES "ai_runs"("id") ON DELETE cascade,
  "user_id" text REFERENCES "users"("id") ON DELETE set null,
  "source" text NOT NULL,
  "feedback_type" text NOT NULL,
  "rating" integer,
  "notes" text,
  "payload" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "ai_feedback_events_run_id_idx" ON "ai_feedback_events" ("ai_run_id");
CREATE INDEX IF NOT EXISTS "ai_feedback_events_source_idx" ON "ai_feedback_events" ("source", "feedback_type");

CREATE TABLE IF NOT EXISTS "eval_datasets" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "feature" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "dataset_kind" text DEFAULT 'offline' NOT NULL,
  "owned_by_role" text DEFAULT 'expert' NOT NULL,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "rubric_set_version" text,
  "failure_ontology_version" text,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "eval_datasets_feature_idx" ON "eval_datasets" ("feature");
CREATE INDEX IF NOT EXISTS "eval_datasets_status_idx" ON "eval_datasets" ("status");

CREATE TABLE IF NOT EXISTS "eval_cases" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "dataset_id" text NOT NULL REFERENCES "eval_datasets"("id") ON DELETE cascade,
  "case_key" text NOT NULL,
  "input" jsonb NOT NULL,
  "expected_output" jsonb DEFAULT '{}'::jsonb,
  "rubric" jsonb DEFAULT '{}'::jsonb,
  "tags" text[] DEFAULT '{}'::text[],
  "status" text DEFAULT 'active' NOT NULL
);

CREATE INDEX IF NOT EXISTS "eval_cases_dataset_id_idx" ON "eval_cases" ("dataset_id");
CREATE UNIQUE INDEX IF NOT EXISTS "eval_cases_dataset_case_key_unique" ON "eval_cases" ("dataset_id", "case_key");

CREATE TABLE IF NOT EXISTS "eval_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "dataset_id" text REFERENCES "eval_datasets"("id") ON DELETE set null,
  "trigger_type" text NOT NULL,
  "feature" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "triggered_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "target_version_id" text,
  "summary" jsonb DEFAULT '{}'::jsonb,
  "started_at_iso" text,
  "completed_at_iso" text,
  "error_message" text
);

CREATE INDEX IF NOT EXISTS "eval_runs_dataset_id_idx" ON "eval_runs" ("dataset_id");
CREATE INDEX IF NOT EXISTS "eval_runs_feature_idx" ON "eval_runs" ("feature");
CREATE INDEX IF NOT EXISTS "eval_runs_status_idx" ON "eval_runs" ("status");

CREATE TABLE IF NOT EXISTS "eval_results" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "eval_run_id" text NOT NULL REFERENCES "eval_runs"("id") ON DELETE cascade,
  "eval_case_id" text REFERENCES "eval_cases"("id") ON DELETE set null,
  "ai_run_id" text REFERENCES "ai_runs"("id") ON DELETE set null,
  "score" numeric(8, 4),
  "pass" boolean DEFAULT false NOT NULL,
  "judge_model" text,
  "output" jsonb DEFAULT '{}'::jsonb,
  "rubric_scores" jsonb DEFAULT '{}'::jsonb,
  "notes" text
);

CREATE INDEX IF NOT EXISTS "eval_results_eval_run_id_idx" ON "eval_results" ("eval_run_id");
CREATE INDEX IF NOT EXISTS "eval_results_ai_run_id_idx" ON "eval_results" ("ai_run_id");

CREATE TABLE IF NOT EXISTS "failure_modes" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "feature" text NOT NULL,
  "ontology_version" text NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "severity" text DEFAULT 'medium' NOT NULL,
  "owned_by_role" text DEFAULT 'expert' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "failure_modes_feature_idx" ON "failure_modes" ("feature");
CREATE INDEX IF NOT EXISTS "failure_modes_ontology_idx" ON "failure_modes" ("ontology_version");
CREATE UNIQUE INDEX IF NOT EXISTS "failure_modes_feature_code_version_unique"
  ON "failure_modes" ("feature", "code", "ontology_version");

CREATE TABLE IF NOT EXISTS "failure_labels" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "ai_run_id" text REFERENCES "ai_runs"("id") ON DELETE cascade,
  "eval_result_id" text REFERENCES "eval_results"("id") ON DELETE cascade,
  "failure_mode_id" text NOT NULL REFERENCES "failure_modes"("id") ON DELETE cascade,
  "labeled_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "source" text DEFAULT 'judge' NOT NULL,
  "confidence" numeric(5, 4),
  "notes" text
);

CREATE INDEX IF NOT EXISTS "failure_labels_run_id_idx" ON "failure_labels" ("ai_run_id");
CREATE INDEX IF NOT EXISTS "failure_labels_eval_result_id_idx" ON "failure_labels" ("eval_result_id");
CREATE INDEX IF NOT EXISTS "failure_labels_failure_mode_id_idx" ON "failure_labels" ("failure_mode_id");

CREATE TABLE IF NOT EXISTS "expert_guidance_packs" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "feature" text NOT NULL,
  "artifact_type" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "target_scope" text DEFAULT 'global' NOT NULL,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "active_version_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "expert_guidance_packs_feature_idx" ON "expert_guidance_packs" ("feature");
CREATE INDEX IF NOT EXISTS "expert_guidance_packs_type_idx" ON "expert_guidance_packs" ("artifact_type");
CREATE INDEX IF NOT EXISTS "expert_guidance_packs_status_idx" ON "expert_guidance_packs" ("status");

CREATE TABLE IF NOT EXISTS "expert_guidance_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "pack_id" text NOT NULL REFERENCES "expert_guidance_packs"("id") ON DELETE cascade,
  "version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "artifact" jsonb NOT NULL,
  "notes" text,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "expert_guidance_versions_pack_id_idx" ON "expert_guidance_versions" ("pack_id");
CREATE UNIQUE INDEX IF NOT EXISTS "expert_guidance_versions_pack_version_unique"
  ON "expert_guidance_versions" ("pack_id", "version");

CREATE TABLE IF NOT EXISTS "teaching_media_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "classroom_id" text REFERENCES "classrooms"("id") ON DELETE cascade,
  "topic_id" text REFERENCES "learning_topics"("id") ON DELETE cascade,
  "created_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "source_type" text DEFAULT 'teacher_curated' NOT NULL,
  "asset_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "media_url" text NOT NULL,
  "thumbnail_url" text,
  "transcript" text,
  "duration_seconds" integer,
  "grade_band" text,
  "language" text DEFAULT 'en' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "teaching_media_assets_org_idx" ON "teaching_media_assets" ("organization_id");
CREATE INDEX IF NOT EXISTS "teaching_media_assets_classroom_idx" ON "teaching_media_assets" ("classroom_id");
CREATE INDEX IF NOT EXISTS "teaching_media_assets_topic_idx" ON "teaching_media_assets" ("topic_id");
CREATE INDEX IF NOT EXISTS "teaching_media_assets_status_idx" ON "teaching_media_assets" ("status");
CREATE INDEX IF NOT EXISTS "teaching_media_assets_asset_type_idx" ON "teaching_media_assets" ("asset_type");

CREATE TABLE IF NOT EXISTS "teaching_media_bindings" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "asset_id" text NOT NULL REFERENCES "teaching_media_assets"("id") ON DELETE cascade,
  "topic_id" text REFERENCES "learning_topics"("id") ON DELETE cascade,
  "classroom_id" text REFERENCES "classrooms"("id") ON DELETE cascade,
  "outcome_id" text,
  "concept_key" text,
  "phase_type" text,
  "grade_band" text,
  "priority" integer DEFAULT 50 NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "teaching_media_bindings_asset_idx" ON "teaching_media_bindings" ("asset_id");
CREATE INDEX IF NOT EXISTS "teaching_media_bindings_topic_idx" ON "teaching_media_bindings" ("topic_id");
CREATE INDEX IF NOT EXISTS "teaching_media_bindings_classroom_idx" ON "teaching_media_bindings" ("classroom_id");
CREATE INDEX IF NOT EXISTS "teaching_media_bindings_lookup_idx"
  ON "teaching_media_bindings" ("topic_id", "concept_key", "phase_type", "priority");

CREATE TABLE IF NOT EXISTS "external_media_cache" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "source_url" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "asset_type" text NOT NULL,
  "thumbnail_url" text,
  "transcript" text,
  "duration_seconds" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "approved_for_direct_use" boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS "external_media_cache_provider_idx" ON "external_media_cache" ("provider");
CREATE UNIQUE INDEX IF NOT EXISTS "external_media_cache_provider_external_unique"
  ON "external_media_cache" ("provider", "external_id");

CREATE TABLE IF NOT EXISTS "teaching_media_usage_events" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "asset_id" text REFERENCES "teaching_media_assets"("id") ON DELETE set null,
  "external_media_id" text REFERENCES "external_media_cache"("id") ON DELETE set null,
  "topic_id" text REFERENCES "learning_topics"("id") ON DELETE set null,
  "session_id" text REFERENCES "learning_sessions"("id") ON DELETE set null,
  "classroom_student_id" text REFERENCES "classroom_students"("id") ON DELETE set null,
  "ai_run_id" text,
  "selection_source" text DEFAULT 'teacher_curated' NOT NULL,
  "reason" text NOT NULL,
  "expected_benefit" text,
  "follow_up_prompt" text,
  "relevance_score" integer,
  "usefulness_score" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "teaching_media_usage_events_topic_idx" ON "teaching_media_usage_events" ("topic_id");
CREATE INDEX IF NOT EXISTS "teaching_media_usage_events_session_idx" ON "teaching_media_usage_events" ("session_id");
CREATE INDEX IF NOT EXISTS "teaching_media_usage_events_student_idx" ON "teaching_media_usage_events" ("classroom_student_id");
CREATE INDEX IF NOT EXISTS "teaching_media_usage_events_ai_run_idx" ON "teaching_media_usage_events" ("ai_run_id");
