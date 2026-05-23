import {
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
  ExpertTutorRuntimeModel,
  LearningOutcomeDefinition,
  FrameworkState,
  LearningSessionState,
  LearningInteractionType,
  SessionOpeningPlan,
  StudentModelSnapshot,
  StudentInterestProfile,
  TeacherProgressReport,
  TopicGroundingPack,
  TopicSourceBoundary,
} from "@/lib/learning/types";
import { defaultLearningSessionState } from "@/lib/learning/types";

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
    defaultContentLocale: text("default_content_locale").default("en").notNull(),
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
    inviteStatus: text("invite_status").default("pending").notNull(),
    onboardingStatus: text("onboarding_status")
      .default("interest_profile_pending")
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
    status: text("status").default("pending").notNull(),
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
      .where(sql`${table.status} = 'pending'`),
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
    key: text("key").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").default("active").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("courses_key_idx").on(table.key),
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
    subject: text("subject"),
    contentLocale: text("content_locale").default("en").notNull(),
    subjectKey: text("subject_key").default("general").notNull(),
    status: text("status").default("draft").notNull(),
    openingPreference: text("opening_preference").default("auto").notNull(),
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
    extractionError: text("extraction_error"),
    indexingStatus: text("indexing_status").default("pending").notNull(),
    indexingError: text("indexing_error"),
    extractedText: text("extracted_text"),
    analysis: jsonb("analysis").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("topic_materials_topic_id_idx").on(table.topicId),
    index("topic_materials_uploaded_by_user_id_idx").on(table.uploadedByUserId),
    check(
      "topic_materials_extraction_status_check",
      sql`${table.extractionStatus} in ('pending', 'processing', 'completed', 'failed')`,
    ),
    check(
      "topic_materials_indexing_status_check",
      sql`${table.indexingStatus} in ('pending', 'processing', 'completed', 'failed')`,
    ),
  ],
);

export const topicMaterialUploadAttempts = pgTable(
  "topic_material_upload_attempts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
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
    status: text("status").default("queued").notNull(),
    stage: text("stage").default("upload").notNull(),
    failureMessage: text("failure_message"),
    materialId: text("material_id").references(() => topicMaterials.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("topic_material_upload_attempts_topic_id_idx").on(table.topicId),
    index("topic_material_upload_attempts_batch_id_idx").on(table.batchId),
    index("topic_material_upload_attempts_status_idx").on(table.status),
    check(
      "topic_material_upload_attempts_status_check",
      sql`${table.status} in ('queued', 'processing', 'succeeded', 'failed')`,
    ),
    check(
      "topic_material_upload_attempts_stage_check",
      sql`${table.stage} in ('upload', 'extraction', 'review', 'indexing')`,
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
    stateVersion: integer("state_version").default(1).notNull(),
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
      sql`${table.sessionStatus} in ('active', 'completed', 'abandoned')`,
    ),
    uniqueIndex("learning_sessions_active_topic_unique")
      .on(
        table.classroomStudentId,
        table.topicId,
        table.sessionType,
        table.sessionLocale,
      )
      .where(
        sql`${table.topicId} is not null and ${table.sessionStatus} = 'active'`,
      ),
    uniqueIndex("learning_sessions_active_non_topic_unique")
      .on(table.classroomStudentId, table.sessionType, table.sessionLocale)
      .where(
        sql`${table.topicId} is null and ${table.sessionStatus} = 'active'`,
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

export const learningMaterialEmbeddings = pgTable(
  "learning_material_embeddings",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    topicId: text("topic_id")
      .notNull()
      .references(() => learningTopics.id, { onDelete: "cascade" }),
    classroomId: text("classroom_id").references(() => classrooms.id, {
      onDelete: "cascade",
    }),
    materialId: text("material_id")
      .notNull()
      .references(() => topicMaterials.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    subjectKey: text("subject_key"),
    gradeBand: text("grade_band"),
    contentLocale: text("content_locale").default("en").notNull(),
    materialKind: text("material_kind"),
    materialTitle: text("material_title"),
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
    index("learning_material_embeddings_classroom_id_idx").on(table.classroomId),
    index("learning_material_embeddings_topic_id_idx").on(table.topicId),
    index("learning_material_embeddings_material_id_idx").on(table.materialId),
    index("learning_material_embeddings_subject_key_idx").on(table.subjectKey),
    index("learning_material_embeddings_locale_idx").on(table.contentLocale),
    index("learning_material_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    uniqueIndex("learning_material_embeddings_material_chunk_unique").on(
      table.materialId,
      table.chunkIndex,
    ),
    index("learning_material_embeddings_retrieval_en_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.retrievalContent})`,
    ),
    index("learning_material_embeddings_retrieval_de_idx").using(
      "gin",
      sql`to_tsvector('german', ${table.retrievalContent})`,
    ),
    index("learning_material_embeddings_retrieval_fr_idx").using(
      "gin",
      sql`to_tsvector('french', ${table.retrievalContent})`,
    ),
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
      enum: ["material", "report", "interaction", "pattern"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    language: text("language").default("en").notNull(),
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
    language: text("language").default("en").notNull(),
    title: text("title").notNull().default("New Chat"),
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
    check(
      "student_progress_reports_visibility_check",
      sql`${table.visibility} in ('teacher_only', 'teacher_and_guardian', 'teacher_student_shared')`,
    ),
  ],
);

// Expert framework rows are owned by the course catalog entry. Deleting a course cascades
// frameworks → versions → runtime models. Classroom topics still use restrict on course_id.
export const expertFrameworks = pgTable(
  "expert_frameworks",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    subjectKey: text("subject_key").default("general").notNull(),
    classroomId: text("classroom_id").references(() => classrooms.id, {
      onDelete: "set null",
    }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    activeVersionId: text("active_version_id").references(
      () => expertFrameworkVersions.id,
      { onDelete: "set null" },
    ),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("expert_frameworks_course_id_idx").on(table.courseId),
    index("expert_frameworks_subject_key_idx").on(table.subjectKey),
    index("expert_frameworks_classroom_idx").on(table.classroomId),
    index("expert_frameworks_topic_idx").on(table.topicId),
  ],
);

export const expertFrameworkVersions = pgTable(
  "expert_framework_versions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    frameworkId: text("framework_id")
      .notNull()
      .references(() => expertFrameworks.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").default("draft").notNull(),
    seedSource: text("seed_source").default("deep_default").notNull(),
    framework: jsonb("framework").$type<ExpertFramework>().notNull(),
    notes: text("notes"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedByUserId: text("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("expert_framework_versions_framework_idx").on(table.frameworkId),
    unique("expert_framework_versions_framework_version_unique").on(
      table.frameworkId,
      table.version,
    ),
    check(
      "expert_framework_versions_status_check",
      sql`${table.status} in ('draft', 'published', 'archived')`,
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
    status: text("status").default("open").notNull(),
    priority: text("priority").default("medium").notNull(),
    reviewType: text("review_type").notNull(),
    tutorFailureSummary: text("tutor_failure_summary").notNull(),
    expertCorrection: text("expert_correction").notNull(),
    relevanceScope: text("relevance_scope").default("general").notNull(),
    frameworkVersionId: text("framework_version_id").references(
      () => expertFrameworkVersions.id,
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
      sql`${table.status} in ('open', 'crystallized', 'dismissed')`,
    ),
    check(
      "expert_review_cases_relevance_scope_check",
      sql`${table.relevanceScope} in ('general', 'framework_specific')`,
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
    frameworkVersionId: text("framework_version_id").references(
      () => expertFrameworkVersions.id,
      { onDelete: "set null" },
    ),
    status: text("status").default("draft").notNull(),
    relevanceScope: text("relevance_scope").default("general").notNull(),
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
    index("expert_crystallizations_framework_version_idx").on(
      table.frameworkVersionId,
    ),
    check(
      "expert_crystallizations_status_check",
      sql`${table.status} in ('draft', 'approved', 'archived')`,
    ),
    check(
      "expert_crystallizations_relevance_scope_check",
      sql`${table.relevanceScope} in ('general', 'framework_specific')`,
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
    frameworkVersionId: text("framework_version_id").references(
      () => expertFrameworkVersions.id,
      { onDelete: "set null" },
    ),
    crystallizationId: text("crystallization_id").references(
      () => expertCrystallizations.id,
      { onDelete: "set null" },
    ),
    status: text("status").default("open").notNull(),
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
    index("expert_conflicts_framework_version_idx").on(table.frameworkVersionId),
    check(
      "expert_conflicts_status_check",
      sql`${table.status} in ('open', 'resolved', 'ignored')`,
    ),
  ],
);

export const expertRuntimeModels = pgTable(
  "expert_runtime_models",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    frameworkId: text("framework_id")
      .notNull()
      .references(() => expertFrameworks.id, { onDelete: "cascade" }),
    frameworkVersionId: text("framework_version_id")
      .notNull()
      .references(() => expertFrameworkVersions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").default("draft").notNull(),
    runtimeModel: jsonb("runtime_model").$type<ExpertTutorRuntimeModel>().notNull(),
    conflictIds: jsonb("conflict_ids").$type<string[]>().default([]),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedByUserId: text("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("expert_runtime_models_course_idx").on(table.courseId),
    index("expert_runtime_models_topic_idx").on(table.topicId),
    unique("expert_runtime_models_course_version_unique").on(
      table.courseId,
      table.version,
    ),
    check(
      "expert_runtime_models_status_check",
      sql`${table.status} in ('draft', 'published', 'archived')`,
    ),
  ],
);

export const studentModels = pgTable(
  "student_models",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    studentUserId: text("student_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    classroomStudentId: text("classroom_student_id")
      .notNull()
      .references(() => classroomStudents.id, { onDelete: "cascade" }),
    latestSnapshotId: text("latest_snapshot_id"),
    summary: text("summary").default("").notNull(),
    anomalyStatus: text("anomaly_status").default("clear").notNull(),
    lastReviewedAt: timestamp("last_reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("student_models_user_idx").on(table.studentUserId),
    unique("student_models_classroom_student_unique").on(table.classroomStudentId),
  ],
);

export const studentModelSnapshots = pgTable(
  "student_model_snapshots",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    studentModelId: text("student_model_id")
      .notNull()
      .references(() => studentModels.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<StudentModelSnapshot>().notNull(),
    sourceType: text("source_type").default("session").notNull(),
    sourceId: text("source_id"),
  },
  (table) => [
    index("student_model_snapshots_model_idx").on(table.studentModelId),
    unique("student_model_snapshots_model_version_unique").on(
      table.studentModelId,
      table.version,
    ),
  ],
);

export const studentModelAnalyses = pgTable(
  "student_model_analyses",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    studentModelId: text("student_model_id")
      .notNull()
      .references(() => studentModels.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id").references(() => learningSessions.id, {
      onDelete: "set null",
    }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").default("completed").notNull(),
    frameworkState: jsonb("framework_state").$type<FrameworkState>(),
    notes: jsonb("notes").$type<Record<string, unknown>>().default({}),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("student_model_analyses_model_idx").on(table.studentModelId),
    index("student_model_analyses_topic_idx").on(table.topicId),
    unique("student_model_analyses_source_unique").on(
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

export const teachingSessions = learningTopics;
export const sessionMaterials = topicMaterials;
export const sessionMaterialUploadAttempts = topicMaterialUploadAttempts;
export const tutoringSessions = learningSessions;

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
  expertRuntimeModels: many(expertRuntimeModels),
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
    studentModel: one(studentModels, {
      fields: [classroomStudents.id],
      references: [studentModels.classroomStudentId],
    }),
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
    embeddings: many(learningMaterialEmbeddings),
    sessions: many(learningSessions),
    interactions: many(learningInteractions),
    reports: many(studentProgressReports),
    expertFrameworks: many(expertFrameworks),
    expertReviewCases: many(expertReviewCases),
    expertCrystallizations: many(expertCrystallizations),
    expertConflicts: many(expertConflicts),
    expertRuntimeModels: many(expertRuntimeModels),
    studentModelAnalyses: many(studentModelAnalyses),
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
    classroom: one(classrooms, {
      fields: [expertFrameworks.classroomId],
      references: [classrooms.id],
    }),
    topic: one(learningTopics, {
      fields: [expertFrameworks.topicId],
      references: [learningTopics.id],
    }),
    versions: many(expertFrameworkVersions),
    runtimeModels: many(expertRuntimeModels),
  }),
);

export const expertFrameworkVersionsRelations = relations(
  expertFrameworkVersions,
  ({ one, many }) => ({
    framework: one(expertFrameworks, {
      fields: [expertFrameworkVersions.frameworkId],
      references: [expertFrameworks.id],
    }),
    publishedBy: one(users, {
      fields: [expertFrameworkVersions.publishedByUserId],
      references: [users.id],
    }),
    crystallizations: many(expertCrystallizations),
    conflicts: many(expertConflicts),
    runtimeModels: many(expertRuntimeModels),
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
    frameworkVersion: one(expertFrameworkVersions, {
      fields: [expertCrystallizations.frameworkVersionId],
      references: [expertFrameworkVersions.id],
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
    frameworkVersion: one(expertFrameworkVersions, {
      fields: [expertConflicts.frameworkVersionId],
      references: [expertFrameworkVersions.id],
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

export const expertRuntimeModelsRelations = relations(
  expertRuntimeModels,
  ({ one }) => ({
    course: one(courses, {
      fields: [expertRuntimeModels.courseId],
      references: [courses.id],
    }),
    topic: one(learningTopics, {
      fields: [expertRuntimeModels.topicId],
      references: [learningTopics.id],
    }),
    framework: one(expertFrameworks, {
      fields: [expertRuntimeModels.frameworkId],
      references: [expertFrameworks.id],
    }),
    frameworkVersion: one(expertFrameworkVersions, {
      fields: [expertRuntimeModels.frameworkVersionId],
      references: [expertFrameworkVersions.id],
    }),
    publishedBy: one(users, {
      fields: [expertRuntimeModels.publishedByUserId],
      references: [users.id],
    }),
  }),
);

export const studentModelsRelations = relations(
  studentModels,
  ({ one, many }) => ({
    studentUser: one(users, {
      fields: [studentModels.studentUserId],
      references: [users.id],
    }),
    classroomStudent: one(classroomStudents, {
      fields: [studentModels.classroomStudentId],
      references: [classroomStudents.id],
    }),
    snapshots: many(studentModelSnapshots),
    analyses: many(studentModelAnalyses),
  }),
);

export const studentModelSnapshotsRelations = relations(
  studentModelSnapshots,
  ({ one }) => ({
    studentModel: one(studentModels, {
      fields: [studentModelSnapshots.studentModelId],
      references: [studentModels.id],
    }),
  }),
);

export const studentModelAnalysesRelations = relations(
  studentModelAnalyses,
  ({ one }) => ({
    studentModel: one(studentModels, {
      fields: [studentModelAnalyses.studentModelId],
      references: [studentModels.id],
    }),
    topic: one(learningTopics, {
      fields: [studentModelAnalyses.topicId],
      references: [learningTopics.id],
    }),
    session: one(learningSessions, {
      fields: [studentModelAnalyses.sessionId],
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
