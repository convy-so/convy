import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { surveys, surveyConversations } from "./surveys";
import { classroomStudents } from "./tutoring";
import { users } from "./auth";
import { timestamps } from "./common";
import {
  CONSENT_CATEGORY_VALUES,
  CONSENT_EVIDENCE_SOURCE_VALUES,
  PRIVACY_DEFAULTS,
} from "@/shared/privacy/constants";

export type ConsentEvidence = {
  source: (typeof CONSENT_EVIDENCE_SOURCE_VALUES)[number];
  categories: Array<(typeof CONSENT_CATEGORY_VALUES)[number]>;
};

export const consentEvents = pgTable(
  "consent_events",
  {
    id: text("id").primaryKey(),
    ...timestamps,
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
    index("consent_events_user_idx").on(table.userId),
    index("consent_events_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: text("id").primaryKey(),
    ...timestamps,
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
    status: text("status").default(PRIVACY_DEFAULTS.statusPending).notNull(),
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
    status: text("status").default(PRIVACY_DEFAULTS.statusPending).notNull(),
    attemptCount: integer("attempt_count")
      .default(PRIVACY_DEFAULTS.attemptCount)
      .notNull(),
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
    scope: text("scope")
      .default(PRIVACY_DEFAULTS.respondentSelfServiceScope)
      .notNull(),
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

