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
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { users } from "./auth";
import { departments, organizations, projects } from "./organization";
import { classrooms } from "./learning";
import type {
  AnalyticsFact,
  AnalyticsGenerationState,
  AnalyticsSnapshot,
  ConversationInsight,
  CoveragePlan,
  EvidenceRecord,
  ResearchBrief,
  SessionState,
} from "@/lib/education/types";
import type {
  SampleConductingProfile,
  SampleFeedbackEntryInput,
  SampleFeedbackPatch,
} from "@/lib/education/sample-feedback";
import type {
  PlaybookAuthorInput,
  PlaybookInterpretation,
  PlaybookPreview,
  ResearchBriefPatch,
  RefinementMessage,
  RefinementProposal,
  SurveyPersonalityAssignment,
} from "@/lib/education/playbooks";
import {
  surveyStatusEnum,
  toneEnum,
  languageEnum,
  creationConversationStatusEnum,
} from "./enums";
import { type ChatMessage, type ExtractedData } from "@/lib/chat-types";

export type SurveyObjective = {
  goal: string;
  context: string;
  decision: string;
  subjectDomain?: string; // e.g. "Healthcare", "HR"
  subjectDescription?: string; // The specific thing being surveyed
};

export type SurveyTargetAudience = {
  description: string;
  relationship: string;
  knowledgeLevel: string;
};

export type SurveyScope = {
  breadthVsDepth: "broad" | "deep" | "balanced";
  mainTopics: string[];
  boundaries: string;
};

export type SurveySuccessCriteria = {
  insightTypes: ("emotional" | "behavioral" | "rational")[];
  detailLevel: "high" | "medium" | "low";
  description: string;
};

export type SurveyConstraints = {
  timeLimit: number | null;
  sensitiveTopics: string[];
  otherConstraints: string;
};

export const MAX_CONVERSATION_DURATION_MINUTES = 30;

export type SurveyHypotheses = {
  assumptions: string[];
};

import { SurveyMedia } from "@/lib/education/brief-media";
export { type SurveyMedia, type SurveyMedia as SurveyImage }; // Re-export as part of media refactor

// export type SurveyImage = SurveyMedia; // Removed as part of media refactor

const surveys = pgTable(
  "surveys",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    classroomId: text("classroom_id").references(() => classrooms.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    deliveryMode: text("delivery_mode").default("link").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    coreObjective: text("core_objective"),
    tone: toneEnum("tone").default("casual"),
    requiredQuestions: text("required_questions").array().default([]),
    metrics: text("metrics").array().default([]),
    media: jsonb("media").$type<SurveyMedia[]>().default([]),
    personalInfo: text("personal_info").array().default([]),
    status: surveyStatusEnum("status").default("creating").notNull(),
    shareableLink: text("shareable_link").unique(),
    customSlug: text("custom_slug").unique(),
    participantLimit: integer("participant_limit").default(50).notNull(),
    currentParticipants: integer("current_participants").default(0).notNull(),
    sampleConversationCount: integer("sample_conversation_count")
      .default(0)
      .notNull(),
    programId: text("program_id"),
    confirmed: boolean("confirmed").default(false).notNull(),
    language: languageEnum("language").default("en").notNull(),
    isVoice: boolean("is_voice").default(false).notNull(),
  },
  (table) => [
    index("surveys_user_id_idx").on(table.userId),
    index("surveys_organization_id_idx").on(table.organizationId),
    index("surveys_department_id_idx").on(table.departmentId),
    index("surveys_classroom_id_idx").on(table.classroomId),
    index("surveys_delivery_mode_idx").on(table.deliveryMode),
    index("surveys_shareable_link_idx").on(table.shareableLink),
    index("surveys_custom_slug_idx").on(table.customSlug),
    index("surveys_status_idx").on(table.status),
    index("surveys_user_org_updated_idx").on(
      table.userId,
      table.organizationId,
      table.updatedAt,
    ),
  ],
);

const surveyCreationConversations = pgTable(
  "survey_creation_conversations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" })
      .unique(),
    messages: jsonb("messages")
      .$type<ChatMessage[]>()
      .notNull()
      .default([]),
    durationMs: integer("duration_ms").default(0),
    activeDurationMs: integer("active_duration_ms").default(0),
    status: creationConversationStatusEnum("status")
      .default("in_progress")
      .notNull(),
    collectedInfo: jsonb("collected_info")
      .$type<Record<string, boolean>>()
      .default({}),
    extractedData: jsonb("extracted_data")
      .$type<ExtractedData>()
      .default({}),
  },
  (table) => [
    index("survey_creation_conversations_survey_id_idx").on(table.surveyId),
    index("survey_creation_conversations_status_idx").on(table.status),
  ],
);

const sampleConversations = pgTable(
  "sample_conversations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    conversationNumber: integer("conversation_number").notNull(),
    messages: jsonb("messages")
      .$type<ChatMessage[]>()
      .notNull(),
    durationMs: integer("duration_ms").default(0),
    activeDurationMs: integer("active_duration_ms").default(0),
    confirmed: boolean("confirmed").default(false).notNull(),
    insights: jsonb("insights").$type<{
      summary: string;
      keyFindings: string[];
      suggestedImprovements: string[];
      coveredTopics: string[];
      missedTopics: string[];
    }>(),
    comments: jsonb("comments")
      .$type<
        Array<{
          id: string;
          userId: string;
          userName: string;
          text: string;
          createdAt: string;
        }>
      >()
      .default([]),
  },
  (table) => [
    index("sample_conversations_survey_id_idx").on(table.surveyId),
    unique("sample_conversations_survey_number_unique").on(
      table.surveyId,
      table.conversationNumber,
    ),
  ],
);

const surveyConversations = pgTable(
  "survey_conversations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    participantId: text("participant_id"),
    rawConversation: jsonb("raw_conversation")
      .$type<ChatMessage[]>()
      .notNull(),
    durationMs: integer("duration_ms").default(0),
    activeDurationMs: integer("active_duration_ms").default(0),
    summary: text("summary"),
    completed: boolean("completed").default(false).notNull(),
    originalLanguage: text("original_language").default("en"),
    translatedConversation: jsonb("translated_conversation").$type<ChatMessage[]>(),
  },
  (table) => [
    index("survey_conversations_survey_id_idx").on(table.surveyId),
    index("survey_conversations_completed_idx").on(table.completed),
    index("survey_conversations_survey_completed_created_idx").on(
      table.surveyId,
      table.completed,
      table.createdAt,
    ),
  ],
);

const surveyBriefs = pgTable(
  "survey_briefs",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" })
      .unique(),
    version: integer("version").default(1).notNull(),
    programId: text("program_id").notNull(),
    brief: jsonb("brief").$type<ResearchBrief>().notNull(),
    completenessStatus: text("completeness_status").default("draft").notNull(),
    approvalState: text("approval_state").default("pending").notNull(),
    missingFields: text("missing_fields").array().default([]).notNull(),
    validationNotes: text("validation_notes").array().default([]).notNull(),
  },
  (table) => [
    index("survey_briefs_survey_id_idx").on(table.surveyId),
    index("survey_briefs_program_id_idx").on(table.programId),
  ],
);

const surveyCoveragePlans = pgTable(
  "survey_coverage_plans",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    plan: jsonb("plan").$type<CoveragePlan>().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    index("survey_coverage_plans_survey_id_idx").on(table.surveyId),
    index("survey_coverage_plans_active_idx").on(table.surveyId, table.isActive),
  ],
);

const surveySessions = pgTable(
  "survey_sessions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    sessionType: text("session_type").notNull(),
    sessionStatus: text("session_status").default("active").notNull(),
    sourceConversationId: text("source_conversation_id"),
    language: text("language").default("en").notNull(),
    respondentId: text("respondent_id"),
    respondentRole: text("respondent_role"),
    sessionState: jsonb("session_state").$type<SessionState>().notNull(),
    summary: text("summary"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("survey_sessions_survey_id_idx").on(table.surveyId),
    index("survey_sessions_type_idx").on(table.surveyId, table.sessionType),
    index("survey_sessions_source_idx").on(table.sourceConversationId),
  ],
);

const surveyTurns = pgTable(
  "survey_turns",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => surveySessions.id, { onDelete: "cascade" }),
    turnIndex: integer("turn_index").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    sourceMessageId: text("source_message_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("survey_turns_session_id_idx").on(table.sessionId),
    unique("survey_turns_session_turn_unique").on(table.sessionId, table.turnIndex),
  ],
);

const surveyEvidence = pgTable(
  "survey_evidence",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => surveySessions.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => surveyTurns.id, {
      onDelete: "set null",
    }),
    nodeId: text("node_id").notNull(),
    evidenceType: text("evidence_type").notNull(),
    excerpt: text("excerpt").notNull(),
    sentiment: text("sentiment"),
    reliability: integer("reliability").default(70).notNull(),
    metadata: jsonb("metadata").$type<EvidenceRecord>().notNull(),
  },
  (table) => [
    index("survey_evidence_survey_id_idx").on(table.surveyId),
    index("survey_evidence_session_id_idx").on(table.sessionId),
    index("survey_evidence_node_id_idx").on(table.nodeId),
  ],
);

const surveySessionInsights = pgTable(
  "survey_session_insights",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => surveySessions.id, { onDelete: "cascade" })
      .unique(),
    insight: jsonb("insight").$type<ConversationInsight>().notNull(),
  },
  (table) => [
    index("survey_session_insights_survey_id_idx").on(table.surveyId),
    index("survey_session_insights_session_id_idx").on(table.sessionId),
  ],
);

const sampleFeedbackEntries = pgTable(
  "sample_feedback_entries",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    sampleConversationId: text("sample_conversation_id").references(() => sampleConversations.id, {
      onDelete: "set null",
    }),
    conversationNumber: integer("conversation_number").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feedbackInput: jsonb("feedback_input").$type<SampleFeedbackEntryInput>().notNull(),
  },
  (table) => [
    index("sample_feedback_entries_survey_id_idx").on(table.surveyId),
    index("sample_feedback_entries_conversation_id_idx").on(table.sampleConversationId),
  ],
);

const sampleFeedbackPatches = pgTable(
  "sample_feedback_patches",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    feedbackEntryId: text("feedback_entry_id")
      .notNull()
      .references(() => sampleFeedbackEntries.id, { onDelete: "cascade" }),
    conversationNumber: integer("conversation_number").notNull(),
    status: text("status").notNull(),
    patch: jsonb("patch").$type<SampleFeedbackPatch>().notNull(),
  },
  (table) => [
    index("sample_feedback_patches_survey_id_idx").on(table.surveyId),
    index("sample_feedback_patches_entry_id_idx").on(table.feedbackEntryId),
  ],
);

const surveyConductingProfiles = pgTable(
  "survey_conducting_profiles",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    version: integer("version").default(1).notNull(),
    sourcePatchId: text("source_patch_id").references(() => sampleFeedbackPatches.id, {
      onDelete: "set null",
    }),
    profile: jsonb("profile").$type<SampleConductingProfile>().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    index("survey_conducting_profiles_survey_id_idx").on(table.surveyId),
    index("survey_conducting_profiles_mode_idx").on(table.surveyId, table.mode, table.isActive),
  ],
);

const surveyPersonalityAssignments = pgTable(
  "survey_personality_assignments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    version: integer("version").default(1).notNull(),
    assignment: jsonb("assignment").$type<SurveyPersonalityAssignment>().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    index("survey_personality_assignments_survey_id_idx").on(table.surveyId),
    index("survey_personality_assignments_mode_idx").on(table.surveyId, table.mode, table.isActive),
  ],
);

const playbooks = pgTable(
  "playbooks",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id").references(() => surveys.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    phase: text("phase").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    latestVersion: integer("latest_version").default(1).notNull(),
    activeVersionId: text("active_version_id"),
  },
  (table) => [
    index("playbooks_survey_id_idx").on(table.surveyId),
    index("playbooks_organization_id_idx").on(table.organizationId),
    index("playbooks_scope_phase_idx").on(table.scope, table.phase),
  ],
);

const playbookVersions = pgTable(
  "playbook_versions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    playbookId: text("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    status: text("status").notNull(),
    input: jsonb("input").$type<PlaybookAuthorInput>().notNull(),
    interpretation: jsonb("interpretation").$type<PlaybookInterpretation>().notNull(),
    preview: jsonb("preview").$type<PlaybookPreview>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
  },
  (table) => [
    index("playbook_versions_playbook_id_idx").on(table.playbookId),
    unique("playbook_versions_unique_version").on(table.playbookId, table.version),
  ],
);

const surveyPlaybookAttachments = pgTable(
  "survey_playbook_attachments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    playbookId: text("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    attachedBy: text("attached_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    index("survey_playbook_attachments_survey_id_idx").on(table.surveyId),
    index("survey_playbook_attachments_playbook_id_idx").on(table.playbookId),
    unique("survey_playbook_attachments_unique").on(table.surveyId, table.playbookId),
  ],
);

const refinementThreads = pgTable(
  "refinement_threads",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" })
      .unique(),
    sampleConversationId: text("sample_conversation_id").references(() => sampleConversations.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    summary: text("summary"),
  },
  (table) => [index("refinement_threads_survey_id_idx").on(table.surveyId)],
);

const refinementMessages = pgTable(
  "refinement_messages",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    threadId: text("thread_id")
      .notNull()
      .references(() => refinementThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    message: jsonb("message").$type<RefinementMessage>().notNull(),
  },
  (table) => [index("refinement_messages_thread_id_idx").on(table.threadId)],
);

const refinementProposals = pgTable(
  "refinement_proposals",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    threadId: text("thread_id")
      .notNull()
      .references(() => refinementThreads.id, { onDelete: "cascade" }),
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull(),
    originalRequest: text("original_request").notNull(),
    interpretation: text("interpretation").notNull(),
    runtimeEffect: jsonb("runtime_effect").$type<string[]>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    proposal: jsonb("proposal").$type<RefinementProposal>().notNull(),
  },
  (table) => [
    index("refinement_proposals_thread_id_idx").on(table.threadId),
    index("refinement_proposals_survey_id_idx").on(table.surveyId),
  ],
);

const researchBriefPatches = pgTable(
  "research_brief_patches",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    proposalId: text("proposal_id").references(() => refinementProposals.id, {
      onDelete: "set null",
    }),
    patch: jsonb("patch").$type<ResearchBriefPatch>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("research_brief_patches_survey_id_idx").on(table.surveyId)],
);

const surveyAnalyticsSnapshots = pgTable(
  "survey_analytics_snapshots",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    snapshot: jsonb("snapshot").$type<AnalyticsSnapshot>().notNull(),
    isLatest: boolean("is_latest").default(true).notNull(),
  },
  (table) => [
    index("survey_analytics_snapshots_survey_id_idx").on(table.surveyId),
    index("survey_analytics_snapshots_latest_idx").on(table.surveyId, table.isLatest),
  ],
);

const surveyAnalyticsStates = pgTable(
  "survey_analytics_states",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" })
      .unique(),
    state: jsonb("state").$type<AnalyticsGenerationState>().notNull(),
  },
  (table) => [index("survey_analytics_states_survey_id_idx").on(table.surveyId)],
);

const surveyAnalyticsFacts = pgTable(
  "survey_analytics_facts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => surveySessions.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    fact: jsonb("fact").$type<AnalyticsFact>().notNull(),
  },
  (table) => [
    index("survey_analytics_facts_survey_id_idx").on(table.surveyId),
    index("survey_analytics_facts_session_id_idx").on(table.sessionId),
    index("survey_analytics_facts_node_id_idx").on(table.nodeId),
  ],
);

const traceRuns = pgTable(
  "trace_runs",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    sessionId: text("session_id").references(() => surveySessions.id, {
      onDelete: "cascade",
    }),
    traceType: text("trace_type").notNull(),
    status: text("status").default("ok").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("trace_runs_survey_id_idx").on(table.surveyId),
    index("trace_runs_session_id_idx").on(table.sessionId),
    index("trace_runs_type_idx").on(table.traceType),
  ],
);

export const participantFeedback = pgTable(
  "participant_feedback",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => surveyConversations.id, { onDelete: "cascade" }),
    rating: integer("rating"), // 1-5
    feltNatural: boolean("felt_natural"),
    uncomfortableTopics: boolean("uncomfortable_topics").default(false).notNull(),
    freeText: text("free_text"),
  },
  (table) => [
    index("participant_feedback_survey_id_idx").on(table.surveyId),
    index("participant_feedback_conversation_id_idx").on(table.conversationId),
  ],
);

const surveysRelations = relations(surveys, ({ one, many }) => ({
  user: one(users, {
    fields: [surveys.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [surveys.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [surveys.departmentId],
    references: [departments.id],
  }),
  classroom: one(classrooms, {
    fields: [surveys.classroomId],
    references: [classrooms.id],
  }),
  project: one(projects, {
    fields: [surveys.projectId],
    references: [projects.id],
  }),
  creationConversation: one(surveyCreationConversations, {
    fields: [surveys.id],
    references: [surveyCreationConversations.surveyId],
  }),
  sampleConversations: many(sampleConversations),
  conversations: many(surveyConversations),
  brief: one(surveyBriefs, {
    fields: [surveys.id],
    references: [surveyBriefs.surveyId],
  }),
  coveragePlans: many(surveyCoveragePlans),
  sessions: many(surveySessions),
  sampleFeedbackEntries: many(sampleFeedbackEntries),
  conductingProfiles: many(surveyConductingProfiles),
  personalityAssignments: many(surveyPersonalityAssignments),
  playbooks: many(playbooks),
  playbookAttachments: many(surveyPlaybookAttachments),
  refinementThreads: many(refinementThreads),
  refinementProposals: many(refinementProposals),
  briefPatches: many(researchBriefPatches),
  analyticsSnapshots: many(surveyAnalyticsSnapshots),
}));

const surveyCreationConversationsRelations = relations(
  surveyCreationConversations,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyCreationConversations.surveyId],
      references: [surveys.id],
    }),
  }),
);

const sampleConversationsRelations = relations(
  sampleConversations,
  ({ one, many }) => ({
    survey: one(surveys, {
      fields: [sampleConversations.surveyId],
      references: [surveys.id],
    }),
    feedbackEntries: many(sampleFeedbackEntries),
  }),
);

const surveyConversationsRelations = relations(
  surveyConversations,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyConversations.surveyId],
      references: [surveys.id],
    }),
  }),
);

const surveyBriefsRelations = relations(surveyBriefs, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyBriefs.surveyId],
    references: [surveys.id],
  }),
}));

const surveyCoveragePlansRelations = relations(
  surveyCoveragePlans,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyCoveragePlans.surveyId],
      references: [surveys.id],
    }),
  }),
);

const surveySessionsRelations = relations(surveySessions, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [surveySessions.surveyId],
    references: [surveys.id],
  }),
  turns: many(surveyTurns),
  evidence: many(surveyEvidence),
  insight: one(surveySessionInsights, {
    fields: [surveySessions.id],
    references: [surveySessionInsights.sessionId],
  }),
}));

const surveyTurnsRelations = relations(surveyTurns, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [surveyTurns.surveyId],
    references: [surveys.id],
  }),
  session: one(surveySessions, {
    fields: [surveyTurns.sessionId],
    references: [surveySessions.id],
  }),
  evidence: many(surveyEvidence),
}));

const surveyEvidenceRelations = relations(surveyEvidence, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyEvidence.surveyId],
    references: [surveys.id],
  }),
  session: one(surveySessions, {
    fields: [surveyEvidence.sessionId],
    references: [surveySessions.id],
  }),
  turn: one(surveyTurns, {
    fields: [surveyEvidence.turnId],
    references: [surveyTurns.id],
  }),
}));

const surveySessionInsightsRelations = relations(
  surveySessionInsights,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveySessionInsights.surveyId],
      references: [surveys.id],
    }),
    session: one(surveySessions, {
      fields: [surveySessionInsights.sessionId],
      references: [surveySessions.id],
    }),
  }),
);

const surveyAnalyticsSnapshotsRelations = relations(
  surveyAnalyticsSnapshots,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyAnalyticsSnapshots.surveyId],
      references: [surveys.id],
    }),
  }),
);

const surveyAnalyticsStatesRelations = relations(
  surveyAnalyticsStates,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyAnalyticsStates.surveyId],
      references: [surveys.id],
    }),
  }),
);

const surveyAnalyticsFactsRelations = relations(
  surveyAnalyticsFacts,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyAnalyticsFacts.surveyId],
      references: [surveys.id],
    }),
    session: one(surveySessions, {
      fields: [surveyAnalyticsFacts.sessionId],
      references: [surveySessions.id],
    }),
  }),
);

const sampleFeedbackEntriesRelations = relations(
  sampleFeedbackEntries,
  ({ one, many }) => ({
    survey: one(surveys, {
      fields: [sampleFeedbackEntries.surveyId],
      references: [surveys.id],
    }),
    sampleConversation: one(sampleConversations, {
      fields: [sampleFeedbackEntries.sampleConversationId],
      references: [sampleConversations.id],
    }),
    patches: many(sampleFeedbackPatches),
  }),
);

const sampleFeedbackPatchesRelations = relations(
  sampleFeedbackPatches,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [sampleFeedbackPatches.surveyId],
      references: [surveys.id],
    }),
    entry: one(sampleFeedbackEntries, {
      fields: [sampleFeedbackPatches.feedbackEntryId],
      references: [sampleFeedbackEntries.id],
    }),
  }),
);

const surveyConductingProfilesRelations = relations(
  surveyConductingProfiles,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyConductingProfiles.surveyId],
      references: [surveys.id],
    }),
    sourcePatch: one(sampleFeedbackPatches, {
      fields: [surveyConductingProfiles.sourcePatchId],
      references: [sampleFeedbackPatches.id],
    }),
  }),
);

const surveyPersonalityAssignmentsRelations = relations(
  surveyPersonalityAssignments,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyPersonalityAssignments.surveyId],
      references: [surveys.id],
    }),
  }),
);

const playbooksRelations = relations(playbooks, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [playbooks.surveyId],
    references: [surveys.id],
  }),
  organization: one(organizations, {
    fields: [playbooks.organizationId],
    references: [organizations.id],
  }),
  versions: many(playbookVersions),
  attachments: many(surveyPlaybookAttachments),
}));

const playbookVersionsRelations = relations(playbookVersions, ({ one }) => ({
  playbook: one(playbooks, {
    fields: [playbookVersions.playbookId],
    references: [playbooks.id],
  }),
}));

const surveyPlaybookAttachmentsRelations = relations(
  surveyPlaybookAttachments,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyPlaybookAttachments.surveyId],
      references: [surveys.id],
    }),
    playbook: one(playbooks, {
      fields: [surveyPlaybookAttachments.playbookId],
      references: [playbooks.id],
    }),
  }),
);

const refinementThreadsRelations = relations(refinementThreads, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [refinementThreads.surveyId],
    references: [surveys.id],
  }),
  sampleConversation: one(sampleConversations, {
    fields: [refinementThreads.sampleConversationId],
    references: [sampleConversations.id],
  }),
  messages: many(refinementMessages),
  proposals: many(refinementProposals),
}));

const refinementMessagesRelations = relations(refinementMessages, ({ one }) => ({
  thread: one(refinementThreads, {
    fields: [refinementMessages.threadId],
    references: [refinementThreads.id],
  }),
}));

const refinementProposalsRelations = relations(refinementProposals, ({ one, many }) => ({
  thread: one(refinementThreads, {
    fields: [refinementProposals.threadId],
    references: [refinementThreads.id],
  }),
  survey: one(surveys, {
    fields: [refinementProposals.surveyId],
    references: [surveys.id],
  }),
  briefPatches: many(researchBriefPatches),
}));

const researchBriefPatchesRelations = relations(researchBriefPatches, ({ one }) => ({
  survey: one(surveys, {
    fields: [researchBriefPatches.surveyId],
    references: [surveys.id],
  }),
  proposal: one(refinementProposals, {
    fields: [researchBriefPatches.proposalId],
    references: [refinementProposals.id],
  }),
}));

export type ChatSessionMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  parts: Array<
    | { type: "text"; text: string }
    | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
    | {
        type: "tool-result";
        toolCallId: string;
        toolName: string;
        result: unknown;
      }
  >;
  createdAt?: string;
};

const analyticsChatSessions = pgTable(
  "analytics_chat_sessions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Chat"),
    messages: jsonb("messages")
      .$type<ChatSessionMessage[]>()
      .notNull()
      .default([]),
    // Tracks how many responses were processed when the last AI summary was generated.
    // Used by the debounced worker to detect if new data exists before burning tokens.
    lastProcessedResponseCount: integer("last_processed_response_count")
      .notNull()
      .default(0),
  },
  (table) => [
    index("analytics_chat_sessions_survey_id_idx").on(table.surveyId),
    index("analytics_chat_sessions_user_id_idx").on(table.userId),
  ],
);

export {
  surveys,
  surveyCreationConversations,
  sampleConversations,
  surveyConversations,
  surveyBriefs,
  surveyCoveragePlans,
  surveySessions,
  surveyTurns,
  surveyEvidence,
  surveySessionInsights,
  sampleFeedbackEntries,
  sampleFeedbackPatches,
  surveyConductingProfiles,
  surveyPersonalityAssignments,
  playbooks,
  playbookVersions,
  surveyPlaybookAttachments,
  refinementThreads,
  refinementMessages,
  refinementProposals,
  researchBriefPatches,
  surveyAnalyticsSnapshots,
  surveyAnalyticsStates,
  surveyAnalyticsFacts,
  traceRuns,
  analyticsChatSessions,
  surveysRelations,
  surveyCreationConversationsRelations,
  sampleConversationsRelations,
  surveyConversationsRelations,
  surveyBriefsRelations,
  surveyCoveragePlansRelations,
  surveySessionsRelations,
  surveyTurnsRelations,
  surveyEvidenceRelations,
  surveySessionInsightsRelations,
  sampleFeedbackEntriesRelations,
  sampleFeedbackPatchesRelations,
  surveyConductingProfilesRelations,
  surveyPersonalityAssignmentsRelations,
  playbooksRelations,
  playbookVersionsRelations,
  surveyPlaybookAttachmentsRelations,
  refinementThreadsRelations,
  refinementMessagesRelations,
  refinementProposalsRelations,
  researchBriefPatchesRelations,
  surveyAnalyticsSnapshotsRelations,
  surveyAnalyticsStatesRelations,
  surveyAnalyticsFactsRelations,
};
