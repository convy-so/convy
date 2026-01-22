import { relations } from "drizzle-orm";
import {
  users,
  accounts,
  sessions,
} from "./auth";
import { surveys } from "./surveys";
import {
  notionIntegrations,
  notionExports,
  notionSyncStatus,
  notionBulkOperations,
  notionPagePermissions,
  notionSyncConflicts,
  slackIntegrations,
  zapierIntegrations,
  zapierWebhookSubscriptions,
} from "./integrations";
import { subscriptions, payments, usageTracking } from "./billing";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  surveys: many(surveys),
  notionIntegration: many(notionIntegrations),
  notionExports: many(notionExports),
  notionSyncStatuses: many(notionSyncStatus),
  notionBulkOperations: many(notionBulkOperations),

  notionPagePermissions: many(notionPagePermissions),
  notionSyncConflicts: many(notionSyncConflicts),
  slackIntegrations: many(slackIntegrations),
  zapierIntegrations: many(zapierIntegrations),
  zapierWebhookSubscriptions: many(zapierWebhookSubscriptions),
  subscriptions: many(subscriptions),
  payments: many(payments),
  usageTracking: many(usageTracking),
}));
