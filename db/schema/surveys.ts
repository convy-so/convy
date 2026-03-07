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
import { organizations, projects } from "./organization";
import {
  surveyStatusEnum,
  toneEnum,
  languageEnum,
  creationConversationStatusEnum,
} from "./enums";

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

export type SurveyMedia = {
  id: string;
  url: string;
  type: "image" | "audio" | "video";
  description: string;
  contextForUse: string;

  durationMs?: number | null;
  mimeType?: string;
  priority?: "high" | "medium" | "low";
  requiredQuestions?: string[];
  expectedInsights?: ("emotional" | "behavioral" | "rational")[];
  altText?: string;
  thumbnailUrl?: string;
};

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
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    coreObjective: text("core_objective"),
    expertState: jsonb("expert_state").$type<Record<string, any>>().default({}),
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
    confirmed: boolean("confirmed").default(false).notNull(),
    language: languageEnum("language").default("en").notNull(),
    domainId: integer("domain_id"), // 1-10 based on the framework
    isVoice: boolean("is_voice").default(false).notNull(),
    improvementFeedback: text("improvement_feedback"),
    collaborators: text("collaborators").array().default([]), // Array of user IDs with edit access
  },
  (table) => [
    index("surveys_user_id_idx").on(table.userId),
    index("surveys_organization_id_idx").on(table.organizationId),
    index("surveys_shareable_link_idx").on(table.shareableLink),
    index("surveys_custom_slug_idx").on(table.customSlug),
    index("surveys_status_idx").on(table.status),
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
      .$type<
        Array<{
          id?: string;
          role: "user" | "assistant";
          content: string;
          parts?: any[]; // For AI SDK v6 parts (tool calls, etc.)
          timestamp: string;
        }>
      >()
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
      .$type<Record<string, any>>()
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
      .$type<
        Array<{
          id?: string;
          role: "user" | "assistant";
          content: string;
          parts?: any[];
          timestamp?: string;
        }>
      >()
      .notNull(),
    durationMs: integer("duration_ms").default(0),
    activeDurationMs: integer("active_duration_ms").default(0),
    feedback: text("feedback"),
    confirmed: boolean("confirmed").default(false).notNull(),
    insights: jsonb("insights").$type<{
      summary: string;
      keyFindings: string[];
      suggestedImprovements: string[];
      coveredTopics: string[];
      missedTopics: string[];
    }>(),
    finalComments: text("final_comments"),
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
      .$type<
        Array<{
          id?: string;
          role: "user" | "assistant";
          content: string;
          parts?: any[];
          timestamp: string;
        }>
      >()
      .notNull(),
    durationMs: integer("duration_ms").default(0),
    activeDurationMs: integer("active_duration_ms").default(0),
    summary: text("summary"),
    completed: boolean("completed").default(false).notNull(),
    originalLanguage: text("original_language").default("en"),
    translatedConversation: jsonb("translated_conversation").$type<
      Array<{
        id?: string;
        role: "user" | "assistant";
        content: string;
        parts?: any[];
        timestamp: string;
      }>
    >(),
  },
  (table) => [
    index("survey_conversations_survey_id_idx").on(table.surveyId),
    index("survey_conversations_completed_idx").on(table.completed),
  ],
);

const conversationInsights = pgTable(
  "conversation_insights",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    conversationId: text("conversation_id")
      .notNull()
      .references(() => surveyConversations.id, { onDelete: "cascade" }),
    insights: jsonb("insights").$type<Record<string, unknown>>().notNull(),
    keyFindings: text("key_findings"),
  },
  (table) => [
    index("conversation_insights_conversation_id_idx").on(table.conversationId),
  ],
);

const surveyAnalytics = pgTable(
  "survey_analytics",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" })
      .unique(),
    overallSummary: text("overall_summary").notNull(),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
    totalConversations: integer("total_conversations").default(0).notNull(),
    averageConversationLength: integer("average_conversation_length")
      .default(0)
      .notNull(),
    lastUpdated: timestamp("last_updated", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    generatedLanguage: text("generated_language").default("en"),
  },
  (table) => [index("survey_analytics_survey_id_idx").on(table.surveyId)],
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
  analytics: one(surveyAnalytics, {
    fields: [surveys.id],
    references: [surveyAnalytics.surveyId],
  }),
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
  ({ one }) => ({
    survey: one(surveys, {
      fields: [sampleConversations.surveyId],
      references: [surveys.id],
    }),
  }),
);

const surveyConversationsRelations = relations(
  surveyConversations,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyConversations.surveyId],
      references: [surveys.id],
    }),
    insights: one(conversationInsights, {
      fields: [surveyConversations.id],
      references: [conversationInsights.conversationId],
    }),
  }),
);

const conversationInsightsRelations = relations(
  conversationInsights,
  ({ one }) => ({
    conversation: one(surveyConversations, {
      fields: [conversationInsights.conversationId],
      references: [surveyConversations.id],
    }),
  }),
);

const surveyAnalyticsRelations = relations(surveyAnalytics, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyAnalytics.surveyId],
    references: [surveys.id],
  }),
}));

export type ChatSessionMessage = {
  id: string;
  role: "user" | "assistant";
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
  conversationInsights,
  surveyAnalytics,
  analyticsChatSessions,
  surveysRelations,
  surveyCreationConversationsRelations,
  sampleConversationsRelations,
  surveyConversationsRelations,
  conversationInsightsRelations,
  surveyAnalyticsRelations,
};
