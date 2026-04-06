import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";

import { timestamps } from "./common";
import { users } from "./auth";
import { organizations } from "./organization";

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    feature: text("feature").notNull(),
    runKind: text("run_kind").default("generation").notNull(),
    scenarioType: text("scenario_type"),
    status: text("status").default("queued").notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorRole: text("actor_role"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    modelProvider: text("model_provider"),
    modelName: text("model_name"),
    promptVersionId: text("prompt_version_id"),
    expertGuidanceVersionId: text("expert_guidance_version_id"),
    userOverlayVersionId: text("user_overlay_version_id"),
    failureOntologyVersion: text("failure_ontology_version"),
    temperatureMilli: integer("temperature_milli"),
    maxTokens: integer("max_tokens"),
    outputText: text("output_text"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 12,
      scale: 6,
    }),
  },
  (table) => [
    index("ai_runs_feature_idx").on(table.feature),
    index("ai_runs_status_idx").on(table.status),
    index("ai_runs_user_id_idx").on(table.userId),
    index("ai_runs_org_id_idx").on(table.organizationId),
    index("ai_runs_resource_idx").on(table.resourceType, table.resourceId),
    index("ai_runs_created_at_idx").on(table.createdAt),
  ],
);

export const aiSteps = pgTable(
  "ai_steps",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    aiRunId: text("ai_run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    stepType: text("step_type").notNull(),
    status: text("status").default("completed").notNull(),
    startedAtIso: text("started_at_iso"),
    completedAtIso: text("completed_at_iso"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    outputSummary: text("output_summary"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
  },
  (table) => [
    index("ai_steps_run_id_idx").on(table.aiRunId),
    index("ai_steps_step_type_idx").on(table.stepType),
  ],
);

export const aiToolCalls = pgTable(
  "ai_tool_calls",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    aiRunId: text("ai_run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    status: text("status").default("completed").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().default({}),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
  },
  (table) => [
    index("ai_tool_calls_run_id_idx").on(table.aiRunId),
    index("ai_tool_calls_tool_name_idx").on(table.toolName),
  ],
);

export const aiContextRecords = pgTable(
  "ai_context_records",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    aiRunId: text("ai_run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    layerKind: text("layer_kind").notNull(),
    layerLabel: text("layer_label").notNull(),
    priority: integer("priority").default(0).notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    versionId: text("version_id"),
    tokenEstimate: integer("token_estimate"),
    contentPreview: text("content_preview"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("ai_context_records_run_id_idx").on(table.aiRunId),
    index("ai_context_records_layer_idx").on(table.layerKind, table.priority),
  ],
);

export const aiFeedbackEvents = pgTable(
  "ai_feedback_events",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    aiRunId: text("ai_run_id").references(() => aiRuns.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    feedbackType: text("feedback_type").notNull(),
    rating: integer("rating"),
    notes: text("notes"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("ai_feedback_events_run_id_idx").on(table.aiRunId),
    index("ai_feedback_events_source_idx").on(table.source, table.feedbackType),
  ],
);

export const evalDatasets = pgTable(
  "eval_datasets",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    feature: text("feature").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default("draft").notNull(),
    datasetKind: text("dataset_kind").default("offline").notNull(),
    ownedByRole: text("owned_by_role").default("expert").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rubricSetVersion: text("rubric_set_version"),
    failureOntologyVersion: text("failure_ontology_version"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("eval_datasets_feature_idx").on(table.feature),
    index("eval_datasets_status_idx").on(table.status),
  ],
);

export const evalCases = pgTable(
  "eval_cases",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    datasetId: text("dataset_id")
      .notNull()
      .references(() => evalDatasets.id, { onDelete: "cascade" }),
    caseKey: text("case_key").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    expectedOutput: jsonb("expected_output")
      .$type<Record<string, unknown>>()
      .default({}),
    rubric: jsonb("rubric").$type<Record<string, unknown>>().default({}),
    tags: text("tags").array().default([]),
    status: text("status").default("active").notNull(),
  },
  (table) => [
    index("eval_cases_dataset_id_idx").on(table.datasetId),
    unique("eval_cases_dataset_case_key_unique").on(table.datasetId, table.caseKey),
  ],
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    datasetId: text("dataset_id").references(() => evalDatasets.id, {
      onDelete: "set null",
    }),
    triggerType: text("trigger_type").notNull(),
    feature: text("feature").notNull(),
    status: text("status").default("queued").notNull(),
    triggeredByUserId: text("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetVersionId: text("target_version_id"),
    summary: jsonb("summary").$type<Record<string, unknown>>().default({}),
    startedAtIso: text("started_at_iso"),
    completedAtIso: text("completed_at_iso"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("eval_runs_dataset_id_idx").on(table.datasetId),
    index("eval_runs_feature_idx").on(table.feature),
    index("eval_runs_status_idx").on(table.status),
  ],
);

export const evalResults = pgTable(
  "eval_results",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    evalRunId: text("eval_run_id")
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    evalCaseId: text("eval_case_id").references(() => evalCases.id, {
      onDelete: "set null",
    }),
    aiRunId: text("ai_run_id").references(() => aiRuns.id, {
      onDelete: "set null",
    }),
    score: numeric("score", { precision: 8, scale: 4 }),
    pass: boolean("pass").default(false).notNull(),
    judgeModel: text("judge_model"),
    output: jsonb("output").$type<Record<string, unknown>>().default({}),
    rubricScores: jsonb("rubric_scores")
      .$type<Record<string, unknown>>()
      .default({}),
    notes: text("notes"),
  },
  (table) => [
    index("eval_results_eval_run_id_idx").on(table.evalRunId),
    index("eval_results_ai_run_id_idx").on(table.aiRunId),
  ],
);

export const failureModes = pgTable(
  "failure_modes",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    feature: text("feature").notNull(),
    ontologyVersion: text("ontology_version").notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").default("medium").notNull(),
    ownedByRole: text("owned_by_role").default("expert").notNull(),
    status: text("status").default("active").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("failure_modes_feature_idx").on(table.feature),
    index("failure_modes_ontology_idx").on(table.ontologyVersion),
    unique("failure_modes_feature_code_version_unique").on(
      table.feature,
      table.code,
      table.ontologyVersion,
    ),
  ],
);

export const failureLabels = pgTable(
  "failure_labels",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    aiRunId: text("ai_run_id").references(() => aiRuns.id, {
      onDelete: "cascade",
    }),
    evalResultId: text("eval_result_id").references(() => evalResults.id, {
      onDelete: "cascade",
    }),
    failureModeId: text("failure_mode_id")
      .notNull()
      .references(() => failureModes.id, { onDelete: "cascade" }),
    labeledByUserId: text("labeled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source").default("judge").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    notes: text("notes"),
  },
  (table) => [
    index("failure_labels_run_id_idx").on(table.aiRunId),
    index("failure_labels_eval_result_id_idx").on(table.evalResultId),
    index("failure_labels_failure_mode_id_idx").on(table.failureModeId),
  ],
);

export const expertGuidancePacks = pgTable(
  "expert_guidance_packs",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    feature: text("feature").notNull(),
    artifactType: text("artifact_type").notNull(),
    status: text("status").default("draft").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    targetScope: text("target_scope").default("global").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activeVersionId: text("active_version_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("expert_guidance_packs_feature_idx").on(table.feature),
    index("expert_guidance_packs_type_idx").on(table.artifactType),
    index("expert_guidance_packs_status_idx").on(table.status),
  ],
);

export const expertGuidanceVersions = pgTable(
  "expert_guidance_versions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    packId: text("pack_id")
      .notNull()
      .references(() => expertGuidancePacks.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    status: text("status").default("draft").notNull(),
    artifact: jsonb("artifact").$type<Record<string, unknown>>().notNull(),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("expert_guidance_versions_pack_id_idx").on(table.packId),
    unique("expert_guidance_versions_pack_version_unique").on(
      table.packId,
      table.version,
    ),
  ],
);
