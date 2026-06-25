import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

import { timestamps } from "./common";
import { users } from "./auth";

import type {
  ExpertFramework,
  ExpertHeuristic,
  MaterialCoverageReview,
  MaterialGroundingMap,
  MaterialSourceDocument,
  LearningOutcomeDefinition,
  LearningSessionState,
  LearningInteractionType,
  SessionOpeningPlan,
  StudentInterestProfile,
  TeacherProgressReport,
  TopicGroundingPack,
  TopicSourceBoundary,
} from "@/features/tutoring/public-server";
import { defaultLearningSessionState } from "@/features/tutoring/public-server";
import {
  EXPERT_CONFLICT_STATUS_VALUES,
  EXPERT_CRYSTALLIZATION_STATUS_VALUES,
  EXPERT_FRAMEWORK_STATUS_VALUES,
  EXPERT_REVIEW_CASE_STATUS_VALUES,
  EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES,
  LEARNING_DEFAULTS,
  LEARNING_DEFAULT_LOCALE,
  LEARNING_EVIDENCE_SOURCE_TYPE_VALUES,
  LEARNING_NUMERIC_DEFAULTS,
  LEARNING_SESSION_STATUS_VALUES,
  LEARNING_STATUS,
  MATERIAL_PIPELINE_STATUS_VALUES,
  MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES,
  MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES,
  REPORT_VISIBILITY_VALUES,
} from "@/shared/learning/constants";

function sqlTextList(values: readonly string[]) {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

export type TeacherStudentChatMessageRecord = {
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
    teacherUserId: text("teacher_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    subject: text("subject"),
    defaultContentLocale: text("default_content_locale")
      .default(LEARNING_DEFAULT_LOCALE)
      .notNull(),
    gradeBand: text("grade_band").notNull(),
    gradeLabel: text("grade_label").notNull(),
    status: text("status").default("active").notNull(),
  },
  (table) => [
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
    inviteStatus: text("invite_status")
      .default(LEARNING_STATUS.invitePending)
      .notNull(),
    onboardingStatus: text("onboarding_status")
      .default(LEARNING_STATUS.onboardingInterestProfilePending)
      .notNull(),
  },
  (table) => [
    index("classroom_students_classroom_id_idx").on(table.classroomId),
    index("classroom_students_user_id_idx").on(table.userId),
    unique("classroom_students_classroom_email_unique").on(
      table.classroomId,
      table.email,
    ),
    uniqueIndex("classroom_students_classroom_user_unique")
      .on(table.classroomId, table.userId)
      .where(sql`${table.userId} is not null`),
    check("classroom_students_email_lowercase_check", sql`lower(${table.email}) = ${table.email}`),
  ],
);

export const classroomInvitations = pgTable(
  "classroom_invitations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    status: text("status").default(LEARNING_STATUS.invitePending).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    respondedAt: timestamp("responded_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("classroom_invitations_classroom_id_idx").on(table.classroomId),
    index("classroom_invitations_email_idx").on(table.invitedEmail),
    index("classroom_invitations_status_idx").on(table.status),
    uniqueIndex("classroom_invitations_pending_unique")
      .on(table.classroomId, table.invitedEmail)
      .where(sql`${table.status} = ${LEARNING_STATUS.invitePending}`),
    check(
      "classroom_invitations_email_lowercase_check",
      sql`lower(${table.invitedEmail}) = ${table.invitedEmail}`,
    ),
  ],
);

export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").default(LEARNING_STATUS.courseActive).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("courses_title_unique").on(table.title),
    index("courses_status_idx").on(table.status),
    index("courses_created_by_user_id_idx").on(table.createdByUserId),
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
    // restrict: block course deletion while any classroom topic still references this catalog row.
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    contentLocale: text("content_locale")
      .default(LEARNING_DEFAULT_LOCALE)
      .notNull(),
    status: text("status").default(LEARNING_STATUS.topicDraft).notNull(),
    openingPreference: text("opening_preference")
      .default(LEARNING_STATUS.topicOpeningAuto)
      .notNull(),
    sourceBoundary: jsonb("source_boundary")
      .$type<TopicSourceBoundary>()
      .notNull(),
    learningOutcomes: jsonb("learning_outcomes")
      .$type<LearningOutcomeDefinition[]>()
      .notNull()
      .default([]),
    readinessAnalysis: jsonb("readiness_analysis")
      .$type<Record<string, unknown> | null>()
      .default(null),
    readinessSourceHash: text("readiness_source_hash"),
    readinessGeneratedAt: timestamp("readiness_generated_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastMaterialSyncAt: timestamp("last_material_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
    topicGroundingPack: jsonb("topic_grounding_pack").$type<TopicGroundingPack | null>(),
    topicGroundingPackBuiltAt: timestamp("topic_grounding_pack_built_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("learning_topics_classroom_id_idx").on(table.classroomId),
    index("learning_topics_created_by_user_id_idx").on(table.createdByUserId),
    index("learning_topics_course_id_idx").on(table.courseId),
    index("learning_topics_status_idx").on(table.status),
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
    extractionStatus: text("extraction_status")
      .default(LEARNING_STATUS.materialPending)
      .notNull(),
    extractionError: text("extraction_error"),
    indexingStatus: text("indexing_status")
      .default(LEARNING_STATUS.materialPending)
      .notNull(),
    indexingError: text("indexing_error"),
    extractedText: text("extracted_text"),
    sourceDocument: jsonb("source_document")
      .$type<MaterialSourceDocument | null>()
      .default(null),
    groundingMap: jsonb("grounding_map")
      .$type<MaterialGroundingMap | null>()
      .default(null),
    coverageReview: jsonb("coverage_review")
      .$type<MaterialCoverageReview | null>()
      .default(null),
    analysis: jsonb("analysis").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("topic_materials_topic_id_idx").on(table.topicId),
    index("topic_materials_uploaded_by_user_id_idx").on(table.uploadedByUserId),
    check(
      "topic_materials_extraction_status_check",
      sql`${table.extractionStatus} in (${sqlTextList(MATERIAL_PIPELINE_STATUS_VALUES)})`,
    ),
    check(
      "topic_materials_indexing_status_check",
      sql`${table.indexingStatus} in (${sqlTextList(MATERIAL_PIPELINE_STATUS_VALUES)})`,
    ),
  ],
);

export const topicMaterialUploadAttempts = pgTable(
  "topic_material_upload_attempts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    previousAttemptId: text("previous_attempt_id").references(
      (): AnyPgColumn => topicMaterialUploadAttempts.id,
      {
        onDelete: "set null",
      },
    ),
    batchId: text("batch_id").notNull(),
    topicId: text("topic_id")
      .notNull()
      .references(() => learningTopics.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    title: text("title"),
    description: text("description"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storageBucket: text("storage_bucket"),
    storagePath: text("storage_path"),
    status: text("status").default(LEARNING_STATUS.uploadQueued).notNull(),
    stage: text("stage").default(LEARNING_STATUS.uploadStageUpload).notNull(),
    userMessage: text("user_message"),
    internalError: text("internal_error"),
    errorCode: text("error_code"),
    retryable: boolean("retryable"),
    queuedAt: timestamp("queued_at", {
      withTimezone: true,
      mode: "date",
    }),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    failedAt: timestamp("failed_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    failureMessage: text("failure_message"),
    materialId: text("material_id").references(() => topicMaterials.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("topic_material_upload_attempts_topic_id_idx").on(table.topicId),
    index("topic_material_upload_attempts_batch_id_idx").on(table.batchId),
    index("topic_material_upload_attempts_status_idx").on(table.status),
    index("topic_material_upload_attempts_previous_attempt_id_idx").on(table.previousAttemptId),
    index("topic_material_upload_attempts_failed_at_idx").on(table.failedAt),
    check(
      "topic_material_upload_attempts_status_check",
      sql`${table.status} in (${sqlTextList(MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES)})`,
    ),
    check(
      "topic_material_upload_attempts_stage_check",
      sql`${table.stage} in (${sqlTextList(MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES)})`,
    ),
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
      .default(LEARNING_STATUS.studentInterestPrivateToStudentAndAgent)
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
    sessionLocale: text("session_locale").default(LEARNING_DEFAULT_LOCALE).notNull(),
    sessionStatus: text("session_status")
      .default(LEARNING_STATUS.sessionActive)
      .notNull(),
    stateVersion: integer("state_version")
      .default(LEARNING_NUMERIC_DEFAULTS.initialVersion)
      .notNull(),
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
    check(
      "learning_sessions_status_check",
      sql`${table.sessionStatus} in (${sqlTextList(LEARNING_SESSION_STATUS_VALUES)})`,
    ),
    uniqueIndex("learning_sessions_active_topic_unique")
      .on(
        table.classroomStudentId,
        table.topicId,
        table.sessionType,
        table.sessionLocale,
      )
      .where(
        sql`${table.topicId} is not null and ${table.sessionStatus} = ${LEARNING_STATUS.sessionActive}`,
      ),
    uniqueIndex("learning_sessions_active_non_topic_unique")
      .on(table.classroomStudentId, table.sessionType, table.sessionLocale)
      .where(
        sql`${table.topicId} is null and ${table.sessionStatus} = ${LEARNING_STATUS.sessionActive}`,
      ),
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
    uniqueIndex("student_access_tokens_token_hash_unique").on(table.tokenHash),
  ],
);

export const learningEvidenceEmbeddings = pgTable(
  "learning_evidence_embeddings",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "cascade",
    }),
    classroomId: text("classroom_id").references(() => classrooms.id, {
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
      enum: LEARNING_EVIDENCE_SOURCE_TYPE_VALUES,
    }).notNull(),
    sourceId: text("source_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    language: text("language").default(LEARNING_DEFAULT_LOCALE).notNull(),
    subjectKey: text("subject_key"),
    gradeBand: text("grade_band"),
    curriculumFrameworkKey: text("curriculum_framework_key"),
    interactionType: text("interaction_type"),
    phaseType: text("phase_type"),
    conceptKey: text("concept_key"),
    scopeType: text("scope_type"),
    sourceTitle: text("source_title"),
    embeddingModel: text("embedding_model"),
    embeddingVersion: text("embedding_version"),
    chunkingVersion: text("chunking_version"),
    contentHash: text("content_hash"),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
      mode: "date",
    }),
    tokenCount: integer("token_count"),
    rawContent: text("raw_content").notNull().default(""),
    retrievalContent: text("retrieval_content").notNull().default(""),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (table) => [
    index("learning_evidence_embeddings_topic_idx").on(table.topicId),
    index("learning_evidence_embeddings_classroom_idx").on(table.classroomId),
    index("learning_evidence_embeddings_student_idx").on(table.classroomStudentId),
    index("learning_evidence_embeddings_user_idx").on(table.studentUserId),
    index("learning_evidence_embeddings_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
    index("learning_evidence_embeddings_language_idx").on(table.language),
    index("learning_evidence_embeddings_subject_idx").on(table.subjectKey),
    index("learning_evidence_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    uniqueIndex("learning_evidence_embeddings_source_chunk_unique").on(
      table.sourceType,
      table.sourceId,
      table.chunkIndex,
      table.language,
    ),
    index("learning_evidence_embeddings_retrieval_en_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.retrievalContent})`,
    ),
    index("learning_evidence_embeddings_retrieval_de_idx").using(
      "gin",
      sql`to_tsvector('german', ${table.retrievalContent})`,
    ),
    index("learning_evidence_embeddings_retrieval_fr_idx").using(
      "gin",
      sql`to_tsvector('french', ${table.retrievalContent})`,
    )
  ],
);

export const teacherStudentChatSessions = pgTable(
  "learning_teacher_chat_sessions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    teacherUserId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language").default(LEARNING_DEFAULT_LOCALE).notNull(),
    title: text("title").notNull().default(LEARNING_DEFAULTS.chatTitle),
    messages: jsonb("messages")
      .$type<TeacherStudentChatMessageRecord[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    index("learning_teacher_chat_sessions_student_idx").on(table.classroomStudentId),
    index("learning_teacher_chat_sessions_user_idx").on(table.teacherUserId),
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
    parts: jsonb("parts").$type<Array<Record<string, unknown>> | null>(),
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
    sourceLocale: text("source_locale").default(LEARNING_DEFAULT_LOCALE).notNull(),
    masteryPercent: integer("mastery_percent")
      .default(LEARNING_NUMERIC_DEFAULTS.zero)
      .notNull(),
    report: jsonb("report").$type<TeacherProgressReport>().notNull(),
    visibility: text("visibility").default(LEARNING_STATUS.reportTeacherOnly).notNull(),
  },
  (table) => [
    index("student_progress_reports_topic_id_idx").on(table.topicId),
    index("student_progress_reports_student_id_idx").on(table.classroomStudentId),
    check(
      "student_progress_reports_visibility_check",
      sql`${table.visibility} in (${sqlTextList(REPORT_VISIBILITY_VALUES)})`,
    ),
  ],
);

// Expert framework rows are owned by the course catalog entry. Deleting a course cascades
// frameworks â†’ versions â†’ runtime models. Classroom topics still use restrict on course_id.
export const expertFrameworks = pgTable(
  "expert_frameworks",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default(LEARNING_STATUS.frameworkDraft).notNull(),
    seedSource: text("seed_source")
      .default(LEARNING_STATUS.frameworkSeedExpertAuthored)
      .notNull(),
    draftFramework: jsonb("draft_framework").$type<ExpertFramework>().notNull(),
    liveFramework: jsonb("live_framework").$type<ExpertFramework | null>().default(null),
    activatedAt: timestamp("activated_at", {
      withTimezone: true,
      mode: "date",
    }),
    activatedByUserId: text("activated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("expert_frameworks_course_id_idx").on(table.courseId),
    index("expert_frameworks_status_idx").on(table.status),
    uniqueIndex("expert_frameworks_one_active_per_course")
      .on(table.courseId)
      .where(sql`${table.status} = ${LEARNING_STATUS.frameworkActive}`),
    check(
      "expert_frameworks_status_check",
      sql`${table.status} in (${sqlTextList(EXPERT_FRAMEWORK_STATUS_VALUES)})`,
    ),
  ],
);

export const expertReviewCases = pgTable(
  "expert_review_cases",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    classroomStudentId: text("classroom_student_id").references(
      () => classroomStudents.id,
      { onDelete: "set null" },
    ),
    sessionId: text("session_id").references(() => learningSessions.id, {
      onDelete: "set null",
    }),
    interactionId: text("interaction_id").references(() => learningInteractions.id, {
      onDelete: "set null",
    }),
    status: text("status").default(LEARNING_STATUS.reviewCaseOpen).notNull(),
    priority: text("priority").default(LEARNING_STATUS.priorityMedium).notNull(),
    reviewType: text("review_type").notNull(),
    tutorFailureSummary: text("tutor_failure_summary").notNull(),
    expertCorrection: text("expert_correction").notNull(),
    relevanceScope: text("relevance_scope")
      .default(LEARNING_STATUS.relevanceGeneral)
      .notNull(),
    frameworkId: text("framework_id").references(
      () => expertFrameworks.id,
      { onDelete: "set null" },
    ),
    reusableSignal: boolean("reusable_signal").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("expert_review_cases_course_idx").on(table.courseId),
    index("expert_review_cases_topic_idx").on(table.topicId),
    index("expert_review_cases_student_idx").on(table.classroomStudentId),
    index("expert_review_cases_session_idx").on(table.sessionId),
    check(
      "expert_review_cases_status_check",
      sql`${table.status} in (${sqlTextList(EXPERT_REVIEW_CASE_STATUS_VALUES)})`,
    ),
    check(
      "expert_review_cases_relevance_scope_check",
      sql`${table.relevanceScope} in (${sqlTextList(EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES)})`,
    ),
  ],
);

export const learningInterventions = pgTable(
  "learning_interventions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
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
    interventionType: text("intervention_type")
      .default(LEARNING_STATUS.interventionReteach)
      .notNull(),
    status: text("status").default(LEARNING_STATUS.interventionPlanned).notNull(),
    priority: text("priority").default(LEARNING_STATUS.priorityMedium).notNull(),
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
    index("learning_interventions_classroom_idx").on(table.classroomId),
    index("learning_interventions_topic_idx").on(table.topicId),
    index("learning_interventions_student_idx").on(table.classroomStudentId),
    index("learning_interventions_status_idx").on(table.status),
  ],
);

export const expertCrystallizations = pgTable(
  "expert_crystallizations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    frameworkId: text("framework_id").references(
      () => expertFrameworks.id,
      { onDelete: "set null" },
    ),
    status: text("status").default(LEARNING_STATUS.crystallizationDraft).notNull(),
    relevanceScope: text("relevance_scope")
      .default(LEARNING_STATUS.relevanceGeneral)
      .notNull(),
    title: text("title").notNull(),
    heuristic: jsonb("heuristic").$type<ExpertHeuristic>().notNull(),
    sourceReviewCaseIds: jsonb("source_review_case_ids")
      .$type<string[]>()
      .default([]),
    notes: text("notes"),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("expert_crystallizations_course_idx").on(table.courseId),
    index("expert_crystallizations_topic_idx").on(table.topicId),
    index("expert_crystallizations_framework_idx").on(
      table.frameworkId,
    ),
    check(
      "expert_crystallizations_status_check",
      sql`${table.status} in (${sqlTextList(EXPERT_CRYSTALLIZATION_STATUS_VALUES)})`,
    ),
    check(
      "expert_crystallizations_relevance_scope_check",
      sql`${table.relevanceScope} in (${sqlTextList(EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES)})`,
    ),
  ],
);

export const expertConflicts = pgTable(
  "expert_conflicts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    frameworkId: text("framework_id").references(
      () => expertFrameworks.id,
      { onDelete: "set null" },
    ),
    crystallizationId: text("crystallization_id").references(
      () => expertCrystallizations.id,
      { onDelete: "set null" },
    ),
    status: text("status").default(LEARNING_STATUS.conflictOpen).notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    resolutionNotes: text("resolution_notes"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("expert_conflicts_course_idx").on(table.courseId),
    index("expert_conflicts_topic_idx").on(table.topicId),
    index("expert_conflicts_framework_idx").on(table.frameworkId),
    check(
      "expert_conflicts_status_check",
      sql`${table.status} in (${sqlTextList(EXPERT_CONFLICT_STATUS_VALUES)})`,
    ),
  ],
);

export const teachingMediaAssets = pgTable(
  "teaching_media_assets",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    classroomId: text("classroom_id").references(() => classrooms.id, {
      onDelete: "cascade",
    }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "cascade",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type")
      .default(LEARNING_STATUS.teachingMediaTeacherCurated)
      .notNull(),
    assetType: text("asset_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    mediaUrl: text("media_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    transcript: text("transcript"),
    durationSeconds: integer("duration_seconds"),
    gradeBand: text("grade_band"),
    language: text("language").default(LEARNING_DEFAULT_LOCALE).notNull(),
    status: text("status").default(LEARNING_STATUS.teachingMediaDraft).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
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
    priority: integer("priority")
      .default(LEARNING_NUMERIC_DEFAULTS.defaultMediaBindingPriority)
      .notNull(),
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

export const teachingMediaUsageEvents = pgTable(
  "teaching_media_usage_events",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    assetId: text("asset_id").references(() => teachingMediaAssets.id, {
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

  ],
);


export const classroomsRelations = relations(classrooms, ({ one, many }) => ({
  teacher: one(users, {
    fields: [classrooms.teacherUserId],
    references: [users.id],
    relationName: "teacher_classrooms",
  }),
  students: many(classroomStudents),
  topics: many(learningTopics),
  teachingMediaAssets: many(teachingMediaAssets),
  teachingMediaBindings: many(teachingMediaBindings),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  creator: one(users, {
    fields: [courses.createdByUserId],
    references: [users.id],
    relationName: "created_courses",
  }),
  sessions: many(learningTopics),
  expertFrameworks: many(expertFrameworks),
  expertReviewCases: many(expertReviewCases),
  expertCrystallizations: many(expertCrystallizations),
  expertConflicts: many(expertConflicts),
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
    reviewCases: many(expertReviewCases),
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
    course: one(courses, {
      fields: [learningTopics.courseId],
      references: [courses.id],
    }),
    materials: many(topicMaterials),
    materialUploadAttempts: many(topicMaterialUploadAttempts),
    sessions: many(learningSessions),
    interactions: many(learningInteractions),
    reports: many(studentProgressReports),
    expertFrameworks: many(expertFrameworks),
    expertReviewCases: many(expertReviewCases),
    expertCrystallizations: many(expertCrystallizations),
    expertConflicts: many(expertConflicts),
    teachingMediaAssets: many(teachingMediaAssets),
    teachingMediaBindings: many(teachingMediaBindings),
    teachingMediaUsageEvents: many(teachingMediaUsageEvents),
  }),
);

export const topicMaterialsRelations = relations(topicMaterials, ({ one }) => ({
  topic: one(learningTopics, {
    fields: [topicMaterials.topicId],
    references: [learningTopics.id],
  }),
  uploadedBy: one(users, {
    fields: [topicMaterials.uploadedByUserId],
    references: [users.id],
    relationName: "uploaded_topic_materials",
  }),
}));

export const topicMaterialUploadAttemptsRelations = relations(
  topicMaterialUploadAttempts,
  ({ one }) => ({
    topic: one(learningTopics, {
      fields: [topicMaterialUploadAttempts.topicId],
      references: [learningTopics.id],
    }),
    uploadedBy: one(users, {
      fields: [topicMaterialUploadAttempts.uploadedByUserId],
      references: [users.id],
      relationName: "uploaded_topic_material_upload_attempts",
    }),
    material: one(topicMaterials, {
      fields: [topicMaterialUploadAttempts.materialId],
      references: [topicMaterials.id],
    }),
  }),
);

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

export const learningEvidenceEmbeddingsRelations = relations(
  learningEvidenceEmbeddings,
  ({ one }) => ({
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

export const teacherStudentChatSessionsRelations = relations(
  teacherStudentChatSessions,
  ({ one }) => ({
    classroomStudent: one(classroomStudents, {
      fields: [teacherStudentChatSessions.classroomStudentId],
      references: [classroomStudents.id],
    }),
    teacherUser: one(users, {
      fields: [teacherStudentChatSessions.teacherUserId],
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

export const expertFrameworksRelations = relations(
  expertFrameworks,
  ({ one, many }) => ({
    course: one(courses, {
      fields: [expertFrameworks.courseId],
      references: [courses.id],
    }),
    activatedBy: one(users, {
      fields: [expertFrameworks.activatedByUserId],
      references: [users.id],
    }),
    crystallizations: many(expertCrystallizations),
    conflicts: many(expertConflicts),
  }),
);

export const expertReviewCasesRelations = relations(
  expertReviewCases,
  ({ one }) => ({
    course: one(courses, {
      fields: [expertReviewCases.courseId],
      references: [courses.id],
    }),
    topic: one(learningTopics, {
      fields: [expertReviewCases.topicId],
      references: [learningTopics.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [expertReviewCases.classroomStudentId],
      references: [classroomStudents.id],
    }),
    session: one(learningSessions, {
      fields: [expertReviewCases.sessionId],
      references: [learningSessions.id],
    }),
    interaction: one(learningInteractions, {
      fields: [expertReviewCases.interactionId],
      references: [learningInteractions.id],
    }),
    framework: one(expertFrameworks, {
      fields: [expertReviewCases.frameworkId],
      references: [expertFrameworks.id],
    }),
    createdBy: one(users, {
      fields: [expertReviewCases.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const expertCrystallizationsRelations = relations(
  expertCrystallizations,
  ({ one }) => ({
    course: one(courses, {
      fields: [expertCrystallizations.courseId],
      references: [courses.id],
    }),
    topic: one(learningTopics, {
      fields: [expertCrystallizations.topicId],
      references: [learningTopics.id],
    }),
    framework: one(expertFrameworks, {
      fields: [expertCrystallizations.frameworkId],
      references: [expertFrameworks.id],
    }),
    approvedBy: one(users, {
      fields: [expertCrystallizations.approvedByUserId],
      references: [users.id],
    }),
  }),
);

export const expertConflictsRelations = relations(
  expertConflicts,
  ({ one }) => ({
    course: one(courses, {
      fields: [expertConflicts.courseId],
      references: [courses.id],
    }),
    topic: one(learningTopics, {
      fields: [expertConflicts.topicId],
      references: [learningTopics.id],
    }),
    framework: one(expertFrameworks, {
      fields: [expertConflicts.frameworkId],
      references: [expertFrameworks.id],
    }),
    crystallization: one(expertCrystallizations, {
      fields: [expertConflicts.crystallizationId],
      references: [expertCrystallizations.id],
    }),
    resolvedBy: one(users, {
      fields: [expertConflicts.resolvedByUserId],
      references: [users.id],
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
  }),
);

export const teachingMediaAssetsRelations = relations(
  teachingMediaAssets,
  ({ one, many }) => ({
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

export const teachingMediaUsageEventsRelations = relations(
  teachingMediaUsageEvents,
  ({ one }) => ({
    asset: one(teachingMediaAssets, {
      fields: [teachingMediaUsageEvents.assetId],
      references: [teachingMediaAssets.id],
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
