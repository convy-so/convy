import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { organizations } from "./organization";
import { surveys, surveyConversations } from "./surveys";
import { classroomStudents } from "./learning";
import { users } from "./auth";
import { timestamps } from "./common";

export type WorkspaceLawfulBasisDeclaration = {
  purpose: string;
  lawfulBasis: string;
  notes?: string | null;
};

export type WorkspacePrivacyProfileSettings = {
  controllerIdentity?: string | null;
  controllerContactName?: string | null;
  controllerContactEmail?: string | null;
  dpoContactEmail?: string | null;
  privacyNoticeUrl?: string | null;
  privacyNoticeText?: string | null;
  processorRoleAcknowledged: boolean;
  enabledProcessors: string[];
  lawfulBasisDeclarations: WorkspaceLawfulBasisDeclaration[];
  dataResidencyMode: "eea_only" | "approved_transfers";
  audienceAgeMode: "unset" | "adult_only" | "includes_minors";
};

export type RetentionPolicySettings = {
  rawTranscriptDays: number;
  voiceTelemetryDays: number;
  derivedAnalyticsDays: number;
  studentInteractionDays: number;
  privacyRequestDays: number;
};

export type ConsentEvidence = {
  source: "banner" | "preferences" | "api";
  categories: Array<"necessary" | "analytics" | "marketing">;
};

export const workspacePrivacyProfiles = pgTable(
  "workspace_privacy_profiles",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" })
      .unique(),
    regionCode: text("region_code").default("eu").notNull(),
    isEuWorkspace: boolean("is_eu_workspace").default(true).notNull(),
    settings: jsonb("settings")
      .$type<WorkspacePrivacyProfileSettings>()
      .notNull(),
    status: text("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("workspace_privacy_profiles_org_idx").on(table.organizationId),
    index("workspace_privacy_profiles_status_idx").on(table.status),
  ],
);

export const consentEvents = pgTable(
  "consent_events",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    consentKey: text("consent_key").notNull(),
    decision: text("decision").notNull(),
    locale: text("locale"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    evidence: jsonb("evidence").$type<ConsentEvidence>().notNull(),
  },
  (table) => [
    index("consent_events_org_idx").on(table.organizationId),
    index("consent_events_user_idx").on(table.userId),
    index("consent_events_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    classroomStudentId: text("classroom_student_id").references(
      () => classroomStudents.id,
      { onDelete: "set null" },
    ),
    subjectType: text("subject_type").notNull(),
    requestType: text("request_type").notNull(),
    status: text("status").default("pending").notNull(),
    requestPayload: jsonb("request_payload")
      .$type<Record<string, unknown>>()
      .default({}),
    resultPayload: jsonb("result_payload")
      .$type<Record<string, unknown>>()
      .default({}),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("privacy_requests_org_idx").on(table.organizationId),
    index("privacy_requests_user_idx").on(table.userId),
    index("privacy_requests_status_idx").on(table.status),
    index("privacy_requests_type_idx").on(table.requestType),
  ],
);

export const deletionJobs = pgTable(
  "deletion_jobs",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    privacyRequestId: text("privacy_request_id")
      .notNull()
      .references(() => privacyRequests.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    status: text("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastError: text("last_error"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("deletion_jobs_request_idx").on(table.privacyRequestId),
    index("deletion_jobs_status_idx").on(table.status),
    index("deletion_jobs_target_idx").on(table.targetType, table.targetId),
  ],
);

export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" })
      .unique(),
    settings: jsonb("settings").$type<RetentionPolicySettings>().notNull(),
  },
  (table) => [index("retention_policies_org_idx").on(table.organizationId)],
);

export const respondentAccessTokens = pgTable(
  "respondent_access_tokens",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => surveyConversations.id, { onDelete: "cascade" }),
    participantId: text("participant_id"),
    tokenHash: text("token_hash").notNull(),
    scope: text("scope").default("respondent_self_service").notNull(),
    ipHash: text("ip_hash"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastUsedAt: timestamp("last_used_at", {
      withTimezone: true,
      mode: "date",
    }),
    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("respondent_access_tokens_survey_idx").on(table.surveyId),
    index("respondent_access_tokens_conversation_idx").on(table.conversationId),
    index("respondent_access_tokens_hash_idx").on(table.tokenHash),
    unique("respondent_access_tokens_hash_unique").on(table.tokenHash),
  ],
);
