import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { users } from "./auth";
import {
  surveys,
  surveyConversations,
} from "./surveys";

// Re-export
export {
  notionIntegrations,
  notionExports,
  notionSyncStatus,
  notionBulkOperations,
  notionPagePermissions,
  notionSyncConflicts,
  zapierIntegrations,
  zapierWebhookSubscriptions,
  zapierWebhookDeliveries,
  slackIntegrations,
  slackPosts,
  notionIntegrationsRelations,
  notionExportsRelations,
  notionSyncStatusRelations,
  notionBulkOperationsRelations,
  notionPagePermissionsRelations,
  notionSyncConflictsRelations,
  zapierIntegrationsRelations,
  zapierWebhookSubscriptionsRelations,
  zapierWebhookDeliveriesRelations,
  slackIntegrationsRelations,
  slackPostsRelations,
};

// --- Notion ---

const notionIntegrations = pgTable(
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

    // Legacy token support
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

const notionExports = pgTable(
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

const notionSyncStatus = pgTable(
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

const notionBulkOperations = pgTable(
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
    status: text("status").notNull().default("pending"),
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

const notionPagePermissions = pgTable(
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

const notionSyncConflicts = pgTable(
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
    resolutionStrategy: text("resolution_strategy"),
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

const notionIntegrationsRelations = relations(
  notionIntegrations,
  ({ one }) => ({
    user: one(users, {
      fields: [notionIntegrations.userId],
      references: [users.id],
    }),
  })
);

const notionExportsRelations = relations(notionExports, ({ one }) => ({
  user: one(users, {
    fields: [notionExports.userId],
    references: [users.id],
  }),
  survey: one(surveys, {
    fields: [notionExports.surveyId],
    references: [surveys.id],
  }),
}));

const notionSyncStatusRelations = relations(
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

const notionBulkOperationsRelations = relations(
  notionBulkOperations,
  ({ one }) => ({
    user: one(users, {
      fields: [notionBulkOperations.userId],
      references: [users.id],
    }),
  })
);

const notionPagePermissionsRelations = relations(
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

const notionSyncConflictsRelations = relations(
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

// --- Zapier ---

const zapierIntegrations = pgTable(
  "zapier_integrations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    apiKey: text("api_key").unique(), // Secure token for authentication
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

const zapierWebhookSubscriptions = pgTable(
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
    targetUrl: text("target_url").notNull(),
    eventType: text("event_type").notNull(),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    active: boolean("active").default(true).notNull(),
    zapierSubscriptionId: text("zapier_subscription_id"),
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

const zapierWebhookDeliveries = pgTable(
  "zapier_webhook_deliveries",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => zapierWebhookSubscriptions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    conversationId: text("conversation_id").references(
      () => surveyConversations.id,
      { onDelete: "cascade" }
    ),
    status: text("status").notNull().default("pending"),
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
    // created_at index: 'createdAt' comes from timestamps spread, but key is 'created_at' in DB column name
    index("zapier_webhook_deliveries_created_at_idx").on(table.createdAt),
  ]
);

const zapierIntegrationsRelations = relations(
  zapierIntegrations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [zapierIntegrations.userId],
      references: [users.id],
    }),
    subscriptions: many(zapierWebhookSubscriptions),
  })
);

const zapierWebhookSubscriptionsRelations = relations(
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

const zapierWebhookDeliveriesRelations = relations(
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

// --- Slack ---

const slackIntegrations = pgTable(
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

const slackPosts = pgTable(
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

const slackIntegrationsRelations = relations(
  slackIntegrations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [slackIntegrations.userId],
      references: [users.id],
    }),
    posts: many(slackPosts),
  })
);

const slackPostsRelations = relations(slackPosts, ({ one }) => ({
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
