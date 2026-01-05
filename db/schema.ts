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
    // Workspace/Organization support (added by Better Auth organization plugin)
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
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

export type SurveyMedia = {
  id: string;
  url: string;
  type: "image" | "audio" | "video";
  description: string;
  contextForUse: string;
  contentSummary?: string;
  infoToGather?: string;
  durationMs?: number | null;
  mimeType?: string;

  // Enhanced fields for better AI integration and analytics
  /** How important it is to show this media (higher = more important) */
  priority?: "high" | "medium" | "low";
  /** Specific questions that MUST be asked about this media */
  requiredQuestions?: string[];
  /** What type of insights we expect from this media */
  expectedInsights?: ("emotional" | "behavioral" | "rational")[];
  /** Alternative text for accessibility */
  altText?: string;
  /** Thumbnail URL for video/audio preview */
  thumbnailUrl?: string;
};

// Legacy alias for backward compatibility in type signatures only
export type SurveyImage = SurveyMedia;

export const surveys = pgTable(
  "surveys",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Workspace/Organization support - surveys can belong to a workspace
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
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
    media: jsonb("media").$type<SurveyMedia[]>().default([]),
    personalInfo: text("personal_info").array().default([]),
    status: surveyStatusEnum("status").default("creating").notNull(),
    shareableLink: text("shareable_link").unique(),
    // Optional human-friendly custom URL slug (Typeform-style)
    customSlug: text("custom_slug").unique(),
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
    index("surveys_organization_id_idx").on(table.organizationId),
    index("surveys_shareable_link_idx").on(table.shareableLink),
    index("surveys_custom_slug_idx").on(table.customSlug),
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
        personalInfo: boolean;
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
        personalInfo: false,
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
        personalInfo?: string[];
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
  organization: one(organizations, {
    fields: [surveys.organizationId],
    references: [organizations.id],
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
  teamMembers: many(surveyTeamMembers),
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

    // OAuth tokens (encrypted)
    accessToken: text("access_token").notNull(),
    accessTokenIv: text("access_token_iv").notNull(),
    accessTokenTag: text("access_token_tag").notNull(),

    // Legacy token support (for backwards compatibility)
    notionToken: text("notion_token"),

    // OAuth metadata
    botId: text("bot_id"),
    workspaceId: text("workspace_id"),
    workspaceName: text("workspace_name"),
    workspaceIcon: text("workspace_icon"),
    tokenType: text("token_type").default("bearer"),
    owner: jsonb("owner").$type<{
      type: string;
      user?: { id: string; name?: string; email?: string };
    }>(),
    duplicatedTemplateId: text("duplicated_template_id"),
    requestId: text("request_id"),

    // Notion structure
    parentPageId: text("parent_page_id"),
    surveyDatabaseId: text("survey_database_id"),

    // Auto-sync settings
    autoSync: boolean("auto_sync").default(true).notNull(),
    syncOnNewConversation: boolean("sync_on_new_conversation")
      .default(true)
      .notNull(),
    syncOnAnalyticsUpdate: boolean("sync_on_analytics_update")
      .default(true)
      .notNull(),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
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
    relatedId: text("related_id"), // conversation ID for conversation exports
    notionPageId: text("notion_page_id").notNull(),
    notionUrl: text("notion_url"),
  },
  (table) => [
    index("notion_exports_user_id_idx").on(table.userId),
    index("notion_exports_survey_id_idx").on(table.surveyId),
    index("notion_exports_related_id_idx").on(table.relatedId),
  ]
);

export const notionSyncStatus = pgTable(
  "notion_sync_status",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    syncType: text("sync_type").notNull(), // 'survey' | 'analytics' | 'conversation' | 'full'
    status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'completed' | 'failed'
    error: text("error"),
    jobId: text("job_id"),
    targetId: text("target_id"), // specific conversation ID if applicable
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("notion_sync_status_user_id_idx").on(table.userId),
    index("notion_sync_status_survey_id_idx").on(table.surveyId),
    index("notion_sync_status_status_idx").on(table.status),
    index("notion_sync_status_job_id_idx").on(table.jobId),
  ]
);

// Zapier Integration Tables
export const zapierIntegrations = pgTable(
  "zapier_integrations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    // Zapier Embed configuration
    embedId: text("embed_id"),
    enabled: boolean("enabled").default(true).notNull(),
    lastUsedAt: timestamp("last_used_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("zapier_integrations_user_id_idx").on(table.userId),
  ]
);

export const zapierWebhookSubscriptions = pgTable(
  "zapier_webhook_subscriptions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    zapierIntegrationId: text("zapier_integration_id")
      .notNull()
      .references(() => zapierIntegrations.id, { onDelete: "cascade" }),
    // Zapier subscription details
    targetUrl: text("target_url").notNull(), // Zapier webhook URL
    eventType: text("event_type").notNull(), // 'survey_created' | 'new_conversation' | 'analytics_updated'
    // Optional filters
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    // Subscription status
    active: boolean("active").default(true).notNull(),
    // Zapier subscription ID (for unsubscribe)
    zapierSubscriptionId: text("zapier_subscription_id"),
    // Metadata
    lastTriggeredAt: timestamp("last_triggered_at", {
      withTimezone: true,
      mode: "date",
    }),
    triggerCount: integer("trigger_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    lastError: text("last_error"),
  },
  (table) => [
    index("zapier_webhook_subscriptions_user_id_idx").on(table.userId),
    index("zapier_webhook_subscriptions_integration_id_idx").on(
      table.zapierIntegrationId
    ),
    index("zapier_webhook_subscriptions_event_type_idx").on(table.eventType),
    index("zapier_webhook_subscriptions_survey_id_idx").on(table.surveyId),
    index("zapier_webhook_subscriptions_active_idx").on(table.active),
  ]
);

export const zapierWebhookDeliveries = pgTable(
  "zapier_webhook_deliveries",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => zapierWebhookSubscriptions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    // Event data reference
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    conversationId: text("conversation_id").references(
      () => surveyConversations.id,
      { onDelete: "cascade" }
    ),
    // Delivery status
    status: text("status").notNull().default("pending"), // 'pending' | 'success' | 'failed'
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    error: text("error"),
    retryCount: integer("retry_count").default(0).notNull(),
    deliveredAt: timestamp("delivered_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("zapier_webhook_deliveries_subscription_id_idx").on(
      table.subscriptionId
    ),
    index("zapier_webhook_deliveries_status_idx").on(table.status),
    index("zapier_webhook_deliveries_event_type_idx").on(table.eventType),
    index("zapier_webhook_deliveries_created_at_idx").on(table.createdAt),
  ]
);

export const zapierIntegrationsRelations = relations(
  zapierIntegrations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [zapierIntegrations.userId],
      references: [users.id],
    }),
    subscriptions: many(zapierWebhookSubscriptions),
  })
);

export const zapierWebhookSubscriptionsRelations = relations(
  zapierWebhookSubscriptions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [zapierWebhookSubscriptions.userId],
      references: [users.id],
    }),
    integration: one(zapierIntegrations, {
      fields: [zapierWebhookSubscriptions.zapierIntegrationId],
      references: [zapierIntegrations.id],
    }),
    survey: one(surveys, {
      fields: [zapierWebhookSubscriptions.surveyId],
      references: [surveys.id],
    }),
    deliveries: many(zapierWebhookDeliveries),
  })
);

export const zapierWebhookDeliveriesRelations = relations(
  zapierWebhookDeliveries,
  ({ one }) => ({
    subscription: one(zapierWebhookSubscriptions, {
      fields: [zapierWebhookDeliveries.subscriptionId],
      references: [zapierWebhookSubscriptions.id],
    }),
    survey: one(surveys, {
      fields: [zapierWebhookDeliveries.surveyId],
      references: [surveys.id],
    }),
    conversation: one(surveyConversations, {
      fields: [zapierWebhookDeliveries.conversationId],
      references: [surveyConversations.id],
    }),
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  surveys: many(surveys),
  notionIntegration: many(notionIntegrations),
  notionExports: many(notionExports),
  notionSyncStatuses: many(notionSyncStatus),
  notionBulkOperations: many(notionBulkOperations),
  surveyTeamMemberships: many(surveyTeamMembers),
  notionPagePermissions: many(notionPagePermissions),
  notionSyncConflicts: many(notionSyncConflicts),
  slackIntegrations: many(slackIntegrations),
  zapierIntegrations: many(zapierIntegrations),
  zapierWebhookSubscriptions: many(zapierWebhookSubscriptions),
  subscriptions: many(subscriptions),
  payments: many(payments),
  usageTracking: many(usageTracking),
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

export const notionSyncStatusRelations = relations(
  notionSyncStatus,
  ({ one }) => ({
    user: one(users, {
      fields: [notionSyncStatus.userId],
      references: [users.id],
    }),
    survey: one(surveys, {
      fields: [notionSyncStatus.surveyId],
      references: [surveys.id],
    }),
  })
);

// Bulk Operations
export const notionBulkOperations = pgTable(
  "notion_bulk_operations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operationType: text("operation_type").notNull(), // 'sync_all' | 'sync_selected' | 'resync' | 'archive' | 'delete'
    targetSurveyIds: text("target_survey_ids").array(), // Array of survey IDs
    totalItems: integer("total_items").default(0).notNull(),
    processedItems: integer("processed_items").default(0).notNull(),
    successCount: integer("success_count").default(0).notNull(),
    failCount: integer("fail_count").default(0).notNull(),
    warningCount: integer("warning_count").default(0).notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
    errors:
      jsonb("errors").$type<
        Array<{ surveyId: string; error: string; timestamp: string }>
      >(),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    estimatedCompletion: timestamp("estimated_completion", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("notion_bulk_operations_user_id_idx").on(table.userId),
    index("notion_bulk_operations_status_idx").on(table.status),
  ]
);

// Team Collaboration
export const surveyTeamMembers = pgTable(
  "survey_team_members",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("viewer"), // 'owner' | 'editor' | 'viewer'
    notionAccess: boolean("notion_access").default(true).notNull(),
    canSync: boolean("can_sync").default(false).notNull(),
    canInvite: boolean("can_invite").default(false).notNull(),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }),
    invitationToken: text("invitation_token"),
  },
  (table) => [
    index("survey_team_members_survey_id_idx").on(table.surveyId),
    index("survey_team_members_user_id_idx").on(table.userId),
    unique("survey_team_members_survey_user_unique").on(
      table.surveyId,
      table.userId
    ),
  ]
);

export const notionPagePermissions = pgTable(
  "notion_page_permissions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    notionPageId: text("notion_page_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    permissionType: text("permission_type").notNull(), // 'read' | 'edit' | 'comment'
    notionUserId: text("notion_user_id"), // User's Notion ID if different
    syncedAt: timestamp("synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    syncStatus: text("sync_status").default("pending"), // 'pending' | 'synced' | 'failed'
  },
  (table) => [
    index("notion_page_permissions_page_id_idx").on(table.notionPageId),
    index("notion_page_permissions_user_id_idx").on(table.userId),
    index("notion_page_permissions_survey_id_idx").on(table.surveyId),
  ]
);

// Sync Conflict Resolution
export const notionSyncConflicts = pgTable(
  "notion_sync_conflicts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(), // 'survey' | 'analytics' | 'conversation'
    resourceId: text("resource_id").notNull(),
    notionPageId: text("notion_page_id").notNull(),
    conflictType: text("conflict_type").notNull(), // 'edit' | 'delete' | 'permission' | 'structure'
    appVersion: jsonb("app_version").$type<Record<string, unknown>>(),
    notionVersion: jsonb("notion_version").$type<Record<string, unknown>>(),
    conflictDetails: jsonb("conflict_details").$type<{
      changedFields?: string[];
      appLastModified?: string;
      notionLastModified?: string;
      deletedInNotion?: boolean;
    }>(),
    resolution: text("resolution").default("pending"), // 'pending' | 'app_wins' | 'notion_wins' | 'merged' | 'manual' | 'ignored'
    resolutionStrategy: text("resolution_strategy"), // 'last_write_wins' | 'app_priority' | 'notion_priority' | 'merge' | 'user_choice'
    resolvedBy: text("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),
    autoResolved: boolean("auto_resolved").default(false),
  },
  (table) => [
    index("notion_sync_conflicts_user_id_idx").on(table.userId),
    index("notion_sync_conflicts_resource_idx").on(
      table.resourceType,
      table.resourceId
    ),
    index("notion_sync_conflicts_resolution_idx").on(table.resolution),
    index("notion_sync_conflicts_page_id_idx").on(table.notionPageId),
  ]
);

export const notionBulkOperationsRelations = relations(
  notionBulkOperations,
  ({ one }) => ({
    user: one(users, {
      fields: [notionBulkOperations.userId],
      references: [users.id],
    }),
  })
);

export const surveyTeamMembersRelations = relations(
  surveyTeamMembers,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyTeamMembers.surveyId],
      references: [surveys.id],
    }),
    user: one(users, {
      fields: [surveyTeamMembers.userId],
      references: [users.id],
    }),
    inviter: one(users, {
      fields: [surveyTeamMembers.invitedBy],
      references: [users.id],
    }),
  })
);

export const notionPagePermissionsRelations = relations(
  notionPagePermissions,
  ({ one }) => ({
    user: one(users, {
      fields: [notionPagePermissions.userId],
      references: [users.id],
    }),
    survey: one(surveys, {
      fields: [notionPagePermissions.surveyId],
      references: [surveys.id],
    }),
  })
);

export const notionSyncConflictsRelations = relations(
  notionSyncConflicts,
  ({ one }) => ({
    user: one(users, {
      fields: [notionSyncConflicts.userId],
      references: [users.id],
    }),
    resolver: one(users, {
      fields: [notionSyncConflicts.resolvedBy],
      references: [users.id],
    }),
  })
);

// Slack Integration Tables
export const slackIntegrations = pgTable(
  "slack_integrations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),

    accessToken: text("access_token").notNull(),
    accessTokenIv: text("access_token_iv").notNull(),
    accessTokenTag: text("access_token_tag").notNull(),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull(),
    teamIcon: text("team_icon"),
    botUserId: text("bot_user_id"),
    scope: text("scope"),
    tokenType: text("token_type").default("bot"),
    defaultChannelId: text("default_channel_id"),
    defaultChannelName: text("default_channel_name"),
    autoPostNewSurveys: boolean("auto_post_new_surveys")
      .default(true)
      .notNull(),
    autoPostAnalytics: boolean("auto_post_analytics").default(true).notNull(),
    autoPostOnConversation: boolean("auto_post_on_conversation")
      .default(true)
      .notNull(),

    lastPostedAt: timestamp("last_posted_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("slack_integrations_user_id_idx").on(table.userId),
    index("slack_integrations_team_id_idx").on(table.teamId),
  ]
);

export const slackPosts = pgTable(
  "slack_posts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slackIntegrationId: text("slack_integration_id")
      .notNull()
      .references(() => slackIntegrations.id, { onDelete: "cascade" }),

    postType: text("post_type").notNull(),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    conversationId: text("conversation_id").references(
      () => surveyConversations.id,
      { onDelete: "cascade" }
    ),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name"),
    messageTs: text("message_ts"),

    messageContent: text("message_content"),
    status: text("status").default("success").notNull(), // 'success' | 'failed'
    error: text("error"),
  },
  (table) => [
    index("slack_posts_user_id_idx").on(table.userId),
    index("slack_posts_survey_id_idx").on(table.surveyId),
    index("slack_posts_integration_id_idx").on(table.slackIntegrationId),
    index("slack_posts_post_type_idx").on(table.postType),
  ]
);

// Slack Relations
export const slackIntegrationsRelations = relations(
  slackIntegrations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [slackIntegrations.userId],
      references: [users.id],
    }),
    posts: many(slackPosts),
  })
);

export const slackPostsRelations = relations(slackPosts, ({ one }) => ({
  user: one(users, {
    fields: [slackPosts.userId],
    references: [users.id],
  }),
  integration: one(slackIntegrations, {
    fields: [slackPosts.slackIntegrationId],
    references: [slackIntegrations.id],
  }),
  survey: one(surveys, {
    fields: [slackPosts.surveyId],
    references: [surveys.id],
  }),
  conversation: one(surveyConversations, {
    fields: [slackPosts.conversationId],
    references: [surveyConversations.id],
  }),
}));

// Voice feature tables
export const voiceSessionStatusEnum = pgEnum("voice_session_status", [
  "active",
  "completed",
  "abandoned",
  "error",
]);

export const voiceSessionTypeEnum = pgEnum("voice_session_type", [
  "survey_creation",
  "survey_response",
]);

export const voiceChunkTypeEnum = pgEnum("voice_chunk_type", [
  "audio_in",
  "audio_out",
]);

export const voiceSessions = pgTable(
  "voice_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    conversationId: text("conversation_id"),
    sessionType: voiceSessionTypeEnum("session_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    durationMs: integer("duration_ms").default(0),
    audioDurationMs: integer("audio_duration_ms").default(0),
    totalCost: text("total_cost").default("0"), // Store as text to avoid precision issues
    sttCost: text("stt_cost").default("0"),
    ttsCost: text("tts_cost").default("0"),
    status: voiceSessionStatusEnum("status").default("active"),
    ...timestamps,
  },
  (table) => [
    index("voice_sessions_user_id_idx").on(table.userId),
    index("voice_sessions_survey_id_idx").on(table.surveyId),
    index("voice_sessions_started_at_idx").on(table.startedAt),
  ]
);

export const voiceChunks = pgTable(
  "voice_chunks",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => voiceSessions.id, { onDelete: "cascade" }),
    chunkType: voiceChunkTypeEnum("chunk_type").notNull(),
    durationMs: integer("duration_ms").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    transcription: text("transcription"),
    synthesisText: text("synthesis_text"),
    cost: text("cost").default("0"),
    hadSpeech: boolean("had_speech").default(true),
    vadProbability: text("vad_probability"),
    processingTimeMs: integer("processing_time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("voice_chunks_session_id_idx").on(table.sessionId)]
);

export const voiceQualityMetrics = pgTable(
  "voice_quality_metrics",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => voiceSessions.id, { onDelete: "cascade" }),
    metricType: text("metric_type").notNull(),
    metricValue: text("metric_value").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("voice_quality_metrics_session_id_idx").on(table.sessionId)]
);

export const voiceSessionsRelations = relations(
  voiceSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [voiceSessions.userId],
      references: [users.id],
    }),
    survey: one(surveys, {
      fields: [voiceSessions.surveyId],
      references: [surveys.id],
    }),
    chunks: many(voiceChunks),
    metrics: many(voiceQualityMetrics),
  })
);

export const voiceChunksRelations = relations(voiceChunks, ({ one }) => ({
  session: one(voiceSessions, {
    fields: [voiceChunks.sessionId],
    references: [voiceSessions.id],
  }),
}));

export const voiceQualityMetricsRelations = relations(
  voiceQualityMetrics,
  ({ one }) => ({
    session: one(voiceSessions, {
      fields: [voiceQualityMetrics.sessionId],
      references: [voiceSessions.id],
    }),
  })
);

// Organization/Workspace tables (managed by Better Auth organization plugin)
// These will be created by Better Auth migrations, but we define them here for type safety
export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const members = pgTable("member", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'owner' | 'member'
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const invitations = pgTable("invitation", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull(), // 'pending' | 'accepted' | 'rejected' | 'cancelled'
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
}));

export const membersRelations = relations(members, ({ one }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
}));

// Subscription Plans and Billing Tables
export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "free",
  "pro",
  "premium",
  "enterprise",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "canceled",
  "past_due",
  "unpaid",
  "trialing",
  "incomplete",
  "incomplete_expired",
]);

export const paymentProviderEnum = pgEnum("payment_provider", [
  "stripe",
  "coinbase_commerce",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "refunded",
  "partially_refunded",
]);

export const paymentCurrencyEnum = pgEnum("payment_currency", [
  "USD",
  "EUR",
  "GBP",
]);

export const cryptoCurrencyEnum = pgEnum("crypto_currency", [
  "USDC",
  "USDT",
  "BTC",
  "ETH",
  "SOL",
]);

// Subscription Plans (static reference data)
export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(), // 'free', 'pro', 'premium', 'enterprise'
  name: text("name").notNull(),
  priceMonthly: integer("price_monthly").notNull(), // in cents (USD)
  priceYearly: integer("price_yearly"), // in cents (USD), null for free/enterprise
  currency: text("currency").default("USD").notNull(),
  interval: text("interval").notNull(), // 'month' | 'year'
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  features: jsonb("features").$type<{
    maxTextSurveys: number | null; // null = unlimited
    maxVoiceSurveys: number | null;
    maxTextResponses: number | null; // per survey or total
    maxVoiceResponses: number | null; // per survey
    maxConcurrentParticipants: number | null; // for voice surveys
    maxWorkspaceMembers: number | null;
    advancedAnalytics: boolean;
    customBranding: boolean;
    customDomain: boolean;
    embeddableWidget: boolean;
    uiCustomization: boolean;
    removeConvyBranding: boolean;
    customIntegrations: boolean;
    sso: boolean;
    dedicatedSupport: boolean;
    sla: boolean;
  }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

// User Subscriptions
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }), // For organization-level subscriptions
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at", {
      withTimezone: true,
      mode: "date",
    }),
    trialStart: timestamp("trial_start", {
      withTimezone: true,
      mode: "date",
    }),
    trialEnd: timestamp("trial_end", {
      withTimezone: true,
      mode: "date",
    }),
    // Payment provider references
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripeCustomerId: text("stripe_customer_id"),
    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_organization_id_idx").on(table.organizationId),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_stripe_subscription_id_idx").on(
      table.stripeSubscriptionId
    ),
    index("subscriptions_stripe_customer_id_idx").on(table.stripeCustomerId),
  ]
);

// Payments (for both Stripe and Coinbase Commerce)
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    provider: paymentProviderEnum("provider").notNull(),
    status: paymentStatusEnum("status").default("pending").notNull(),
    // Amounts (all stored in USD cents for consistency)
    amountUsdCents: integer("amount_usd_cents").notNull(),
    amountOriginal: integer("amount_original").notNull(), // Original amount in original currency
    currency: paymentCurrencyEnum("currency").default("USD").notNull(),
    // Crypto payment details (if applicable)
    cryptoCurrency: cryptoCurrencyEnum("crypto_currency"),
    cryptoAmount: text("crypto_amount"), // Store as text to avoid precision issues
    exchangeRate: text("exchange_rate"), // Rate used for conversion
    // Provider-specific IDs
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    stripeInvoiceId: text("stripe_invoice_id"),
    coinbaseChargeId: text("coinbase_charge_id").unique(),
    // Payment metadata
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // Timestamps
    paidAt: timestamp("paid_at", {
      withTimezone: true,
      mode: "date",
    }),
    failedAt: timestamp("failed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("payments_user_id_idx").on(table.userId),
    index("payments_subscription_id_idx").on(table.subscriptionId),
    index("payments_status_idx").on(table.status),
    index("payments_provider_idx").on(table.provider),
    index("payments_stripe_payment_intent_id_idx").on(
      table.stripePaymentIntentId
    ),
    index("payments_coinbase_charge_id_idx").on(table.coinbaseChargeId),
  ]
);

// Usage Tracking (for enforcing plan limits)
export const usageTracking = pgTable(
  "usage_tracking",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    // Usage metrics (reset based on subscription period)
    periodStart: timestamp("period_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    periodEnd: timestamp("period_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    // Counts
    textSurveysCount: integer("text_surveys_count").default(0).notNull(),
    voiceSurveysCount: integer("voice_surveys_count").default(0).notNull(),
    textResponsesCount: integer("text_responses_count").default(0).notNull(),
    voiceResponsesCount: integer("voice_responses_count").default(0).notNull(),
    // Per-survey tracking (stored as JSONB for flexibility)
    surveyUsage: jsonb("survey_usage").$type<
      Record<
        string,
        {
          textResponses: number;
          voiceResponses: number;
          concurrentParticipants?: number;
        }
      >
    >().default({}),
  },
  (table) => [
    index("usage_tracking_user_id_idx").on(table.userId),
    index("usage_tracking_organization_id_idx").on(table.organizationId),
    index("usage_tracking_period_idx").on(table.periodStart, table.periodEnd),
  ]
);

// Relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [payments.planId],
    references: [subscriptionPlans.id],
  }),
}));

export const usageTrackingRelations = relations(usageTracking, ({ one }) => ({
  user: one(users, {
    fields: [usageTracking.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [usageTracking.organizationId],
    references: [organizations.id],
  }),
}));

export const authSchema = {
  user: users,
  account: accounts,
  session: sessions,
  verification: verificationTokens,
  organization: organizations,
  member: members,
  invitation: invitations,
};
