import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { users } from "./auth";
import { organizations } from "./organization";
import {
  subscriptionStatusEnum,
  paymentProviderEnum,
  paymentStatusEnum,
  paymentCurrencyEnum,
  cryptoCurrencyEnum,
} from "./enums";
// Subscription Plans (static reference data)
const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
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
    maxWorkspaceMembers: number | null; // per workspace
    maxWorkspaces: number | null; // total workspaces allowed
    maxVoiceMinutesPerSession: number | null; // max minutes per voice conversation
    advancedAnalytics: boolean;
    customBranding: boolean;
    customDomain: boolean;
    embeddableWidget: boolean;
    uiCustomization: boolean;
    removeConvyBranding: boolean;
    customIntegrations: boolean;
    zapierIntegration: boolean;
    notionIntegration: boolean;
    slackIntegration: boolean;
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
const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }), // For organization level subscriptions. 
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
    // Composite index for common query: userId + status + currentPeriodEnd
    index("subscriptions_user_status_period_idx").on(
      table.userId,
      table.status,
      table.currentPeriodEnd
    ),
  ]
);

// Payments
const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "restrict", // Prevent orphaned payments - subscription must exist
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

// Usage Tracking
const usageTracking = pgTable(
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
    voiceMinutesUsed: numeric("voice_minutes_used").default("0").notNull(),
    // Per-survey tracking
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
    // Unique constraint: one usage record per user/org/period
    unique("usage_tracking_user_org_period_unique").on(
      table.userId,
      table.organizationId,
      table.periodStart
    ),
  ]
);

const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
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

const paymentsRelations = relations(payments, ({ one }) => ({
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

const usageTrackingRelations = relations(usageTracking, ({ one }) => ({
  user: one(users, {
    fields: [usageTracking.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [usageTracking.organizationId],
    references: [organizations.id],
  }),
}));

export {
  subscriptionPlans,
  subscriptions,
  payments,
  usageTracking,
  subscriptionsRelations,
  paymentsRelations,
  usageTrackingRelations,
};