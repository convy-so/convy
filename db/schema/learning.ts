import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { timestamps } from "./common";
import { departments, organizations } from "./organization";
import { users } from "./auth";
import type {
  LearningOutcomeDefinition,
  LearningSessionState,
  LearningInteractionType,
  SessionOpeningPlan,
  StudentInterestProfile,
  TeacherProgressReport,
  TopicSourceBoundary,
} from "@/lib/learning/types";
import { defaultLearningSessionState } from "@/lib/learning/types";
import type { StudentLearningPatternProfile } from "@/lib/learning/pattern-types";

export type LearningTeacherChatSessionMessage = {
  id?: string;
  role: string;
  content?: string;
  parts?: Array<Record<string, unknown>>;
  createdAt?: string;
};

export const classrooms = pgTable(
  "classrooms",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    teacherUserId: text("teacher_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    subject: text("subject"),
    defaultContentLocale: text("default_content_locale").default("en").notNull(),
    gradeBand: text("grade_band").notNull(),
    gradeLabel: text("grade_label").notNull(),
    status: text("status").default("active").notNull(),
  },
  (table) => [
    index("classrooms_organization_id_idx").on(table.organizationId),
    index("classrooms_department_id_idx").on(table.departmentId),
    index("classrooms_teacher_user_id_idx").on(table.teacherUserId),
    index("classrooms_grade_band_idx").on(table.gradeBand),
  ],
);

export const classroomStudents = pgTable(
  "classroom_students",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    inviteStatus: text("invite_status").default("pending").notNull(),
    onboardingStatus: text("onboarding_status")
      .default("interest_profile_pending")
      .notNull(),
    lastActiveAt: timestamp("last_active_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("classroom_students_classroom_id_idx").on(table.classroomId),
    index("classroom_students_user_id_idx").on(table.userId),
    unique("classroom_students_classroom_email_unique").on(
      table.classroomId,
      table.email,
    ),
  ],
);

export const classroomTeacherAccess = pgTable(
  "classroom_teacher_access",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    teacherUserId: text("teacher_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedByUserId: text("granted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessLevel: text("access_level").default("collaborator").notNull(),
  },
  (table) => [
    index("classroom_teacher_access_classroom_idx").on(table.classroomId),
    index("classroom_teacher_access_teacher_idx").on(table.teacherUserId),
    unique("classroom_teacher_access_unique").on(
      table.classroomId,
      table.teacherUserId,
    ),
  ],
);

export const classroomAccessRequests = pgTable(
  "classroom_access_requests",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").default("pending").notNull(),
    message: text("message"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("classroom_access_requests_classroom_idx").on(table.classroomId),
    index("classroom_access_requests_requester_idx").on(table.requesterUserId),
    index("classroom_access_requests_status_idx").on(table.status),
    unique("classroom_access_requests_unique").on(
      table.classroomId,
      table.requesterUserId,
      table.status,
    ),
  ],
);

export const learningTopics = pgTable(
  "learning_topics",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    subject: text("subject"),
    contentLocale: text("content_locale").default("en").notNull(),
    subjectKey: text("subject_key").default("general").notNull(),
    subjectLabel: text("subject_label").default("General").notNull(),
    status: text("status").default("draft").notNull(),
    openingPreference: text("opening_preference").default("auto").notNull(),
    sourceBoundary: jsonb("source_boundary")
      .$type<TopicSourceBoundary>()
      .notNull(),
    learningOutcomes: jsonb("learning_outcomes")
      .$type<LearningOutcomeDefinition[]>()
      .notNull()
      .default([]),
    lastMaterialSyncAt: timestamp("last_material_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("learning_topics_classroom_id_idx").on(table.classroomId),
    index("learning_topics_created_by_user_id_idx").on(table.createdByUserId),
    index("learning_topics_status_idx").on(table.status),
    index("learning_topics_subject_key_idx").on(table.subjectKey),
  ],
);

export const topicMaterials = pgTable(
  "topic_materials",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    topicId: text("topic_id")
      .notNull()
      .references(() => learningTopics.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    materialKind: text("material_kind").notNull(),
    storageBucket: text("storage_bucket"),
    storagePath: text("storage_path"),
    publicUrl: text("public_url"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    extractionStatus: text("extraction_status").default("pending").notNull(),
    indexingStatus: text("indexing_status").default("pending").notNull(),
    extractedText: text("extracted_text"),
    analysis: jsonb("analysis").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("topic_materials_topic_id_idx").on(table.topicId),
    index("topic_materials_uploaded_by_user_id_idx").on(table.uploadedByUserId),
  ],
);

export const studentInterestProfiles = pgTable(
  "student_interest_profiles",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" })
      .unique(),
    profile: jsonb("profile").$type<StudentInterestProfile>().notNull(),
    visibility: text("visibility")
      .default("private_to_student_and_agent")
      .notNull(),
    lastRefreshedAt: timestamp("last_refreshed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [index("student_interest_profiles_student_id_idx").on(table.classroomStudentId)],
);

export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "cascade",
    }),
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    sessionType: text("session_type").notNull(),
    sessionLocale: text("session_locale").default("en").notNull(),
    sessionStatus: text("session_status").default("active").notNull(),
    state: jsonb("state")
      .$type<LearningSessionState>()
      .default(defaultLearningSessionState),
    openingPlan: jsonb("opening_plan").$type<SessionOpeningPlan>(),
    summary: text("summary"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("learning_sessions_topic_id_idx").on(table.topicId),
    index("learning_sessions_student_id_idx").on(table.classroomStudentId),
    index("learning_sessions_type_idx").on(table.sessionType),
  ],
);

export const studentAccessTokens = pgTable(
  "student_access_tokens",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("student_access_tokens_student_id_idx").on(table.classroomStudentId),
    index("student_access_tokens_user_id_idx").on(table.userId),
    index("student_access_tokens_token_hash_idx").on(table.tokenHash),
  ],
);

export const learningMaterialEmbeddings = pgTable(
  "learning_material_embeddings",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    topicId: text("topic_id")
      .notNull()
      .references(() => learningTopics.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => topicMaterials.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("learning_material_embeddings_topic_id_idx").on(table.topicId),
    index("learning_material_embeddings_material_id_idx").on(table.materialId),
    index("learning_material_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const learningEvidenceEmbeddings = pgTable(
  "learning_evidence_embeddings",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "cascade",
    }),
    classroomStudentId: text("classroom_student_id").references(
      () => classroomStudents.id,
      { onDelete: "cascade" },
    ),
    studentUserId: text("student_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    sourceType: text("source_type", {
      enum: ["material", "report", "interaction", "pattern"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    language: text("language").default("en").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("learning_evidence_embeddings_org_idx").on(table.organizationId),
    index("learning_evidence_embeddings_topic_idx").on(table.topicId),
    index("learning_evidence_embeddings_student_idx").on(table.classroomStudentId),
    index("learning_evidence_embeddings_user_idx").on(table.studentUserId),
    index("learning_evidence_embeddings_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
    index("learning_evidence_embeddings_language_idx").on(table.language),
    index("learning_evidence_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const learningTeacherChatSessions = pgTable(
  "learning_teacher_chat_sessions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language").default("en").notNull(),
    title: text("title").notNull().default("New Chat"),
    messages: jsonb("messages")
      .$type<LearningTeacherChatSessionMessage[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    index("learning_teacher_chat_sessions_org_idx").on(table.organizationId),
    index("learning_teacher_chat_sessions_student_idx").on(table.classroomStudentId),
    index("learning_teacher_chat_sessions_user_idx").on(table.userId),
  ],
);

export const learningMessages = pgTable(
  "learning_messages",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    sessionId: text("session_id")
      .notNull()
      .references(() => learningSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [index("learning_messages_session_id_idx").on(table.sessionId)],
);

export const learningInteractions = pgTable(
  "learning_interactions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "cascade",
    }),
    sessionId: text("session_id").references(() => learningSessions.id, {
      onDelete: "cascade",
    }),
    role: text("role").notNull(),
    interactionType: text("interaction_type")
      .$type<LearningInteractionType>()
      .notNull(),
    phaseId: integer("phase_id"),
    phaseType: text("phase_type"),
    conceptKey: text("concept_key"),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("learning_interactions_student_id_idx").on(table.classroomStudentId),
    index("learning_interactions_topic_id_idx").on(table.topicId),
    index("learning_interactions_session_id_idx").on(table.sessionId),
    index("learning_interactions_phase_idx").on(table.sessionId, table.phaseId),
  ],
);

export const studentProgressReports = pgTable(
  "student_progress_reports",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    topicId: text("topic_id")
      .notNull()
      .references(() => learningTopics.id, { onDelete: "cascade" }),
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    generatedFromSessionId: text("generated_from_session_id").references(
      () => learningSessions.id,
      { onDelete: "set null" },
    ),
    sourceLocale: text("source_locale").default("en").notNull(),
    masteryPercent: integer("mastery_percent").default(0).notNull(),
    report: jsonb("report").$type<TeacherProgressReport>().notNull(),
    visibility: text("visibility").default("teacher_only").notNull(),
  },
  (table) => [
    index("student_progress_reports_topic_id_idx").on(table.topicId),
    index("student_progress_reports_student_id_idx").on(table.classroomStudentId),
  ],
);

export const learningInterventions = pgTable(
  "learning_interventions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    interventionType: text("intervention_type").default("reteach").notNull(),
    status: text("status").default("planned").notNull(),
    priority: text("priority").default("medium").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: timestamp("due_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("learning_interventions_org_idx").on(table.organizationId),
    index("learning_interventions_classroom_idx").on(table.classroomId),
    index("learning_interventions_topic_idx").on(table.topicId),
    index("learning_interventions_student_idx").on(table.classroomStudentId),
    index("learning_interventions_status_idx").on(table.status),
  ],
);

export const studentLearningPatternProfiles = pgTable(
  "student_learning_pattern_profiles",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentUserId: text("student_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeRef: text("scope_ref").notNull(),
    subjectKey: text("subject_key"),
    subjectLabel: text("subject_label"),
    patternConfidencePercent: integer("pattern_confidence_percent")
      .default(0)
      .notNull(),
    confidenceByDimension: jsonb("confidence_by_dimension")
      .$type<Record<string, number>>()
      .default({}),
    profile: jsonb("profile").$type<StudentLearningPatternProfile>().notNull(),
    summaryLocale: text("summary_locale").default("en").notNull(),
    teacherSummary: text("teacher_summary").default("").notNull(),
    studentSummary: text("student_summary").default("").notNull(),
    engagementTrend: text("engagement_trend").default("stable").notNull(),
    lastAnalyzedSourceType: text("last_analyzed_source_type"),
    lastAnalyzedSourceId: text("last_analyzed_source_id"),
    lastMem0SyncAt: timestamp("last_mem0_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("student_learning_pattern_profiles_org_idx").on(table.organizationId),
    index("student_learning_pattern_profiles_user_idx").on(table.studentUserId),
    index("student_learning_pattern_profiles_subject_idx").on(table.subjectKey),
    unique("student_learning_pattern_profiles_scope_unique").on(
      table.organizationId,
      table.studentUserId,
      table.scopeType,
      table.scopeRef,
    ),
  ],
);

export const studentLearningPatternAnalyses = pgTable(
  "student_learning_pattern_analyses",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentUserId: text("student_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    classroomStudentId: text("classroom_student_id").references(
      () => classroomStudents.id,
      { onDelete: "set null" },
    ),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").default("queued").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    mem0References: jsonb("mem0_references")
      .$type<Array<Record<string, unknown>>>()
      .default([]),
    profileScopeRefs: jsonb("profile_scope_refs")
      .$type<Array<Record<string, string | null>>>()
      .default([]),
    errorMessage: text("error_message"),
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
    index("student_learning_pattern_analyses_org_idx").on(table.organizationId),
    index("student_learning_pattern_analyses_user_idx").on(table.studentUserId),
    index("student_learning_pattern_analyses_topic_idx").on(table.topicId),
    unique("student_learning_pattern_analyses_source_unique").on(
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export const teachingMediaAssets = pgTable(
  "teaching_media_assets",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    classroomId: text("classroom_id").references(() => classrooms.id, {
      onDelete: "cascade",
    }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "cascade",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").default("teacher_curated").notNull(),
    assetType: text("asset_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    mediaUrl: text("media_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    transcript: text("transcript"),
    durationSeconds: integer("duration_seconds"),
    gradeBand: text("grade_band"),
    language: text("language").default("en").notNull(),
    status: text("status").default("draft").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("teaching_media_assets_org_idx").on(table.organizationId),
    index("teaching_media_assets_classroom_idx").on(table.classroomId),
    index("teaching_media_assets_topic_idx").on(table.topicId),
    index("teaching_media_assets_status_idx").on(table.status),
    index("teaching_media_assets_asset_type_idx").on(table.assetType),
  ],
);

export const teachingMediaBindings = pgTable(
  "teaching_media_bindings",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    assetId: text("asset_id")
      .notNull()
      .references(() => teachingMediaAssets.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "cascade",
    }),
    classroomId: text("classroom_id").references(() => classrooms.id, {
      onDelete: "cascade",
    }),
    outcomeId: text("outcome_id"),
    conceptKey: text("concept_key"),
    phaseType: text("phase_type"),
    gradeBand: text("grade_band"),
    priority: integer("priority").default(50).notNull(),
    isRequired: boolean("is_required").default(false).notNull(),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("teaching_media_bindings_asset_idx").on(table.assetId),
    index("teaching_media_bindings_topic_idx").on(table.topicId),
    index("teaching_media_bindings_classroom_idx").on(table.classroomId),
    index("teaching_media_bindings_lookup_idx").on(
      table.topicId,
      table.conceptKey,
      table.phaseType,
      table.priority,
    ),
  ],
);

export const externalMediaCache = pgTable(
  "external_media_cache",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    assetType: text("asset_type").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    transcript: text("transcript"),
    durationSeconds: integer("duration_seconds"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    approvedForDirectUse: boolean("approved_for_direct_use").default(false).notNull(),
  },
  (table) => [
    index("external_media_cache_provider_idx").on(table.provider),
    unique("external_media_cache_provider_external_unique").on(
      table.provider,
      table.externalId,
    ),
  ],
);

export const teachingMediaUsageEvents = pgTable(
  "teaching_media_usage_events",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    assetId: text("asset_id").references(() => teachingMediaAssets.id, {
      onDelete: "set null",
    }),
    externalMediaId: text("external_media_id").references(() => externalMediaCache.id, {
      onDelete: "set null",
    }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id").references(() => learningSessions.id, {
      onDelete: "set null",
    }),
    classroomStudentId: text("classroom_student_id").references(
      () => classroomStudents.id,
      { onDelete: "set null" },
    ),
    aiRunId: text("ai_run_id"),
    selectionSource: text("selection_source").default("teacher_curated").notNull(),
    reason: text("reason").notNull(),
    expectedBenefit: text("expected_benefit"),
    followUpPrompt: text("follow_up_prompt"),
    relevanceScore: integer("relevance_score"),
    usefulnessScore: integer("usefulness_score"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("teaching_media_usage_events_topic_idx").on(table.topicId),
    index("teaching_media_usage_events_session_idx").on(table.sessionId),
    index("teaching_media_usage_events_student_idx").on(table.classroomStudentId),
    index("teaching_media_usage_events_ai_run_idx").on(table.aiRunId),
  ],
);

export const classroomsRelations = relations(classrooms, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [classrooms.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [classrooms.departmentId],
    references: [departments.id],
  }),
  teacher: one(users, {
    fields: [classrooms.teacherUserId],
    references: [users.id],
    relationName: "teacher_classrooms",
  }),
  teacherAccess: many(classroomTeacherAccess),
  accessRequests: many(classroomAccessRequests),
  students: many(classroomStudents),
  topics: many(learningTopics),
  teachingMediaAssets: many(teachingMediaAssets),
  teachingMediaBindings: many(teachingMediaBindings),
}));

export const classroomStudentsRelations = relations(
  classroomStudents,
  ({ one, many }) => ({
    classroom: one(classrooms, {
      fields: [classroomStudents.classroomId],
      references: [classrooms.id],
    }),
    user: one(users, {
      fields: [classroomStudents.userId],
      references: [users.id],
      relationName: "student_classroom_memberships",
    }),
    invitedBy: one(users, {
      fields: [classroomStudents.invitedByUserId],
      references: [users.id],
      relationName: "student_classroom_invites_created",
    }),
    interestProfile: one(studentInterestProfiles, {
      fields: [classroomStudents.id],
      references: [studentInterestProfiles.classroomStudentId],
    }),
    accessTokens: many(studentAccessTokens),
    sessions: many(learningSessions),
    interactions: many(learningInteractions),
    reports: many(studentProgressReports),
    interventions: many(learningInterventions),
    patternAnalyses: many(studentLearningPatternAnalyses),
  }),
);

export const classroomTeacherAccessRelations = relations(
  classroomTeacherAccess,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [classroomTeacherAccess.classroomId],
      references: [classrooms.id],
    }),
    teacher: one(users, {
      fields: [classroomTeacherAccess.teacherUserId],
      references: [users.id],
      relationName: "classroom_teacher_access_user",
    }),
    grantedBy: one(users, {
      fields: [classroomTeacherAccess.grantedByUserId],
      references: [users.id],
      relationName: "classroom_teacher_access_granted_by",
    }),
  }),
);

export const classroomAccessRequestsRelations = relations(
  classroomAccessRequests,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [classroomAccessRequests.classroomId],
      references: [classrooms.id],
    }),
    requester: one(users, {
      fields: [classroomAccessRequests.requesterUserId],
      references: [users.id],
      relationName: "classroom_access_request_requester",
    }),
    resolvedBy: one(users, {
      fields: [classroomAccessRequests.resolvedByUserId],
      references: [users.id],
      relationName: "classroom_access_request_resolved_by",
    }),
  }),
);

export const learningTopicsRelations = relations(
  learningTopics,
  ({ one, many }) => ({
    classroom: one(classrooms, {
      fields: [learningTopics.classroomId],
      references: [classrooms.id],
    }),
    creator: one(users, {
      fields: [learningTopics.createdByUserId],
      references: [users.id],
      relationName: "created_learning_topics",
    }),
    materials: many(topicMaterials),
    embeddings: many(learningMaterialEmbeddings),
    sessions: many(learningSessions),
    interactions: many(learningInteractions),
    reports: many(studentProgressReports),
    patternAnalyses: many(studentLearningPatternAnalyses),
    teachingMediaAssets: many(teachingMediaAssets),
    teachingMediaBindings: many(teachingMediaBindings),
    teachingMediaUsageEvents: many(teachingMediaUsageEvents),
  }),
);

export const topicMaterialsRelations = relations(topicMaterials, ({ one, many }) => ({
  topic: one(learningTopics, {
    fields: [topicMaterials.topicId],
    references: [learningTopics.id],
  }),
  uploadedBy: one(users, {
    fields: [topicMaterials.uploadedByUserId],
    references: [users.id],
    relationName: "uploaded_topic_materials",
  }),
  embeddings: many(learningMaterialEmbeddings),
}));

export const studentInterestProfilesRelations = relations(
  studentInterestProfiles,
  ({ one }) => ({
    classroomStudent: one(classroomStudents, {
      fields: [studentInterestProfiles.classroomStudentId],
      references: [classroomStudents.id],
    }),
  }),
);

export const learningSessionsRelations = relations(
  learningSessions,
  ({ one, many }) => ({
    topic: one(learningTopics, {
      fields: [learningSessions.topicId],
      references: [learningTopics.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [learningSessions.classroomStudentId],
      references: [classroomStudents.id],
    }),
    messages: many(learningMessages),
    interactions: many(learningInteractions),
    reports: many(studentProgressReports),
    teachingMediaUsageEvents: many(teachingMediaUsageEvents),
  }),
);

export const studentAccessTokensRelations = relations(
  studentAccessTokens,
  ({ one }) => ({
    classroomStudent: one(classroomStudents, {
      fields: [studentAccessTokens.classroomStudentId],
      references: [classroomStudents.id],
    }),
    user: one(users, {
      fields: [studentAccessTokens.userId],
      references: [users.id],
    }),
  }),
);

export const learningMaterialEmbeddingsRelations = relations(
  learningMaterialEmbeddings,
  ({ one }) => ({
    topic: one(learningTopics, {
      fields: [learningMaterialEmbeddings.topicId],
      references: [learningTopics.id],
    }),
    material: one(topicMaterials, {
      fields: [learningMaterialEmbeddings.materialId],
      references: [topicMaterials.id],
    }),
  }),
);

export const learningEvidenceEmbeddingsRelations = relations(
  learningEvidenceEmbeddings,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [learningEvidenceEmbeddings.organizationId],
      references: [organizations.id],
    }),
    topic: one(learningTopics, {
      fields: [learningEvidenceEmbeddings.topicId],
      references: [learningTopics.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [learningEvidenceEmbeddings.classroomStudentId],
      references: [classroomStudents.id],
    }),
    studentUser: one(users, {
      fields: [learningEvidenceEmbeddings.studentUserId],
      references: [users.id],
    }),
  }),
);

export const learningTeacherChatSessionsRelations = relations(
  learningTeacherChatSessions,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [learningTeacherChatSessions.organizationId],
      references: [organizations.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [learningTeacherChatSessions.classroomStudentId],
      references: [classroomStudents.id],
    }),
    user: one(users, {
      fields: [learningTeacherChatSessions.userId],
      references: [users.id],
    }),
  }),
);

export const learningMessagesRelations = relations(
  learningMessages,
  ({ one }) => ({
    session: one(learningSessions, {
      fields: [learningMessages.sessionId],
      references: [learningSessions.id],
    }),
  }),
);

export const learningInteractionsRelations = relations(
  learningInteractions,
  ({ one }) => ({
    classroomStudent: one(classroomStudents, {
      fields: [learningInteractions.classroomStudentId],
      references: [classroomStudents.id],
    }),
    topic: one(learningTopics, {
      fields: [learningInteractions.topicId],
      references: [learningTopics.id],
    }),
    session: one(learningSessions, {
      fields: [learningInteractions.sessionId],
      references: [learningSessions.id],
    }),
  }),
);

export const studentLearningPatternProfilesRelations = relations(
  studentLearningPatternProfiles,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [studentLearningPatternProfiles.organizationId],
      references: [organizations.id],
    }),
    studentUser: one(users, {
      fields: [studentLearningPatternProfiles.studentUserId],
      references: [users.id],
    }),
  }),
);

export const studentLearningPatternAnalysesRelations = relations(
  studentLearningPatternAnalyses,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [studentLearningPatternAnalyses.organizationId],
      references: [organizations.id],
    }),
    studentUser: one(users, {
      fields: [studentLearningPatternAnalyses.studentUserId],
      references: [users.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [studentLearningPatternAnalyses.classroomStudentId],
      references: [classroomStudents.id],
    }),
    topic: one(learningTopics, {
      fields: [studentLearningPatternAnalyses.topicId],
      references: [learningTopics.id],
    }),
  }),
);

export const studentProgressReportsRelations = relations(
  studentProgressReports,
  ({ one }) => ({
    topic: one(learningTopics, {
      fields: [studentProgressReports.topicId],
      references: [learningTopics.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [studentProgressReports.classroomStudentId],
      references: [classroomStudents.id],
    }),
    session: one(learningSessions, {
      fields: [studentProgressReports.generatedFromSessionId],
      references: [learningSessions.id],
    }),
  }),
);

export const learningInterventionsRelations = relations(
  learningInterventions,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [learningInterventions.classroomId],
      references: [classrooms.id],
    }),
    topic: one(learningTopics, {
      fields: [learningInterventions.topicId],
      references: [learningTopics.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [learningInterventions.classroomStudentId],
      references: [classroomStudents.id],
    }),
    createdBy: one(users, {
      fields: [learningInterventions.createdByUserId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [learningInterventions.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const teachingMediaAssetsRelations = relations(
  teachingMediaAssets,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [teachingMediaAssets.organizationId],
      references: [organizations.id],
    }),
    classroom: one(classrooms, {
      fields: [teachingMediaAssets.classroomId],
      references: [classrooms.id],
    }),
    topic: one(learningTopics, {
      fields: [teachingMediaAssets.topicId],
      references: [learningTopics.id],
    }),
    createdBy: one(users, {
      fields: [teachingMediaAssets.createdByUserId],
      references: [users.id],
    }),
    bindings: many(teachingMediaBindings),
    usageEvents: many(teachingMediaUsageEvents),
  }),
);

export const teachingMediaBindingsRelations = relations(
  teachingMediaBindings,
  ({ one }) => ({
    asset: one(teachingMediaAssets, {
      fields: [teachingMediaBindings.assetId],
      references: [teachingMediaAssets.id],
    }),
    topic: one(learningTopics, {
      fields: [teachingMediaBindings.topicId],
      references: [learningTopics.id],
    }),
    classroom: one(classrooms, {
      fields: [teachingMediaBindings.classroomId],
      references: [classrooms.id],
    }),
  }),
);

export const externalMediaCacheRelations = relations(
  externalMediaCache,
  ({ many }) => ({
    usageEvents: many(teachingMediaUsageEvents),
  }),
);

export const teachingMediaUsageEventsRelations = relations(
  teachingMediaUsageEvents,
  ({ one }) => ({
    asset: one(teachingMediaAssets, {
      fields: [teachingMediaUsageEvents.assetId],
      references: [teachingMediaAssets.id],
    }),
    externalMedia: one(externalMediaCache, {
      fields: [teachingMediaUsageEvents.externalMediaId],
      references: [externalMediaCache.id],
    }),
    topic: one(learningTopics, {
      fields: [teachingMediaUsageEvents.topicId],
      references: [learningTopics.id],
    }),
    session: one(learningSessions, {
      fields: [teachingMediaUsageEvents.sessionId],
      references: [learningSessions.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [teachingMediaUsageEvents.classroomStudentId],
      references: [classroomStudents.id],
    }),
  }),
);

export {
  // Exported directly above.
};
