import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const surveyStatusEnum = pgEnum("survey_status", [
  "draft",
  "creating",
  "sample_review",
  "active",
  "completed",
  "archived",
]);

export const languageEnum = pgEnum("language", ["en", "fr", "de"]);
export const toneEnum = pgEnum("tone", [
  "formal",
  "casual",
  "playful",
  "empathetic",
]);
export const creationConversationStatusEnum = pgEnum(
  "creation_conversation_status",
  ["in_progress", "completed", "abandoned"]
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    name: text("name").notNull(),
    image: text("image"),
    role: userRoleEnum("role").default("user").notNull(),
  },
  (table) => [unique("users_email_unique").on(table.email)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    scope: text("scope"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    password: text("password"),
  },
  (table) => [
    unique("accounts_provider_account_unique").on(
      table.providerId,
      table.accountId
    ),
    index("accounts_user_id_idx").on(table.userId),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    unique("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ]
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export type SurveyObjective = {
  goal: string;
  context: string;
  decision: string;
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

export type SurveyImage = {
  id: string;
  url: string;
  description: string;
  contextForUse: string;
  placementInConversation: string;
};

export const surveys = pgTable(
  "surveys",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    objective: jsonb("objective").$type<SurveyObjective>(),
    targetAudience: jsonb("target_audience").$type<SurveyTargetAudience>(),
    scope: jsonb("scope").$type<SurveyScope>(),
    successCriteria: jsonb("success_criteria").$type<SurveySuccessCriteria>(),
    constraints: jsonb("constraints").$type<SurveyConstraints>(),
    hypotheses: jsonb("hypotheses").$type<SurveyHypotheses>(),
    tone: toneEnum("tone").default("casual"),
    additionalContext: text("additional_context"),
    requiredQuestions: text("required_questions").array().default([]),
    metrics: text("metrics").array().default([]),
    images: jsonb("images").$type<SurveyImage[]>().default([]),
    status: surveyStatusEnum("status").default("creating").notNull(),
    shareableLink: text("shareable_link").unique(),
    participantLimit: integer("participant_limit").default(50).notNull(),
    currentParticipants: integer("current_participants").default(0).notNull(),
    sampleConversationCount: integer("sample_conversation_count")
      .default(0)
      .notNull(),
    confirmed: boolean("confirmed").default(false).notNull(),
    language: languageEnum("language").default("en").notNull(),
  },
  (table) => [
    index("surveys_user_id_idx").on(table.userId),
    index("surveys_shareable_link_idx").on(table.shareableLink),
    index("surveys_status_idx").on(table.status),
  ]
);

export const surveyCreationConversations = pgTable(
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
          role: "user" | "assistant";
          content: string;
          timestamp: string;
        }>
      >()
      .notNull()
      .default([]),
    status: creationConversationStatusEnum("status")
      .default("in_progress")
      .notNull(),
    collectedInfo: jsonb("collected_info")
      .$type<{
        objective: boolean;
        targetAudience: boolean;
        scope: boolean;
        successCriteria: boolean;
        constraints: boolean;
        hypotheses: boolean;
        tone: boolean;
        additionalContext: boolean;
        requiredQuestions: boolean;
        metrics: boolean;
      }>()
      .default({
        objective: false,
        targetAudience: false,
        scope: false,
        successCriteria: false,
        constraints: false,
        hypotheses: false,
        tone: false,
        additionalContext: false,
        requiredQuestions: false,
        metrics: false,
      }),
    extractedData: jsonb("extracted_data")
      .$type<{
        objective?: SurveyObjective;
        targetAudience?: SurveyTargetAudience;
        scope?: SurveyScope;
        successCriteria?: SurveySuccessCriteria;
        constraints?: SurveyConstraints;
        hypotheses?: SurveyHypotheses;
        tone?: "formal" | "casual" | "playful" | "empathetic";
        additionalContext?: string;
        metrics?: string[];
        title?: string;
      }>()
      .default({}),
  },
  (table) => [
    index("survey_creation_conversations_survey_id_idx").on(table.surveyId),
    index("survey_creation_conversations_status_idx").on(table.status),
  ]
);

export const sampleConversations = pgTable(
  "sample_conversations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    conversationNumber: integer("conversation_number").notNull(),
    messages: jsonb("messages")
      .$type<Array<{ role: "user" | "assistant"; content: string }>>()
      .notNull(),
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
  },
  (table) => [
    index("sample_conversations_survey_id_idx").on(table.surveyId),
    unique("sample_conversations_survey_number_unique").on(
      table.surveyId,
      table.conversationNumber
    ),
  ]
);

export const surveyConversations = pgTable(
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
          role: "user" | "assistant";
          content: string;
          timestamp: string;
        }>
      >()
      .notNull(),
    summary: text("summary"),
    completed: boolean("completed").default(false).notNull(),
  },
  (table) => [
    index("survey_conversations_survey_id_idx").on(table.surveyId),
    index("survey_conversations_completed_idx").on(table.completed),
  ]
);

export const conversationInsights = pgTable(
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
  ]
);

export const surveyAnalytics = pgTable(
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
    }).defaultNow(),
  },
  (table) => [index("survey_analytics_survey_id_idx").on(table.surveyId)]
);

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  user: one(users, {
    fields: [surveys.userId],
    references: [users.id],
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

export const surveyCreationConversationsRelations = relations(
  surveyCreationConversations,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyCreationConversations.surveyId],
      references: [surveys.id],
    }),
  })
);

export const sampleConversationsRelations = relations(
  sampleConversations,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [sampleConversations.surveyId],
      references: [surveys.id],
    }),
  })
);

export const surveyConversationsRelations = relations(
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
  })
);

export const conversationInsightsRelations = relations(
  conversationInsights,
  ({ one }) => ({
    conversation: one(surveyConversations, {
      fields: [conversationInsights.conversationId],
      references: [surveyConversations.id],
    }),
  })
);

export const surveyAnalyticsRelations = relations(
  surveyAnalytics,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyAnalytics.surveyId],
      references: [surveys.id],
    }),
  })
);

export const notionIntegrations = pgTable(
  "notion_integrations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    notionToken: text("notion_token").notNull(),
    workspaceName: text("workspace_name"),
    parentPageId: text("parent_page_id"),
    surveyDatabaseId: text("survey_database_id"),
  },
  (table) => [index("notion_integrations_user_id_idx").on(table.userId)]
);

export const notionExports = pgTable(
  "notion_exports",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    exportType: text("export_type").notNull(), // 'survey', 'analytics', 'conversation'
    notionPageId: text("notion_page_id").notNull(),
    notionUrl: text("notion_url"),
  },
  (table) => [
    index("notion_exports_user_id_idx").on(table.userId),
    index("notion_exports_survey_id_idx").on(table.surveyId),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  surveys: many(surveys),
  notionIntegration: many(notionIntegrations),
  notionExports: many(notionExports),
}));

export const notionIntegrationsRelations = relations(
  notionIntegrations,
  ({ one }) => ({
    user: one(users, {
      fields: [notionIntegrations.userId],
      references: [users.id],
    }),
  })
);

export const notionExportsRelations = relations(notionExports, ({ one }) => ({
  user: one(users, {
    fields: [notionExports.userId],
    references: [users.id],
  }),
  survey: one(surveys, {
    fields: [notionExports.surveyId],
    references: [surveys.id],
  }),
}));

export const authSchema = {
  user: users,
  account: accounts,
  session: sessions,
  verification: verificationTokens,
};
