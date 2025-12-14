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

export const authSchema = {
  user: users,
  account: accounts,
  session: sessions,
  verification: verificationTokens,
};
