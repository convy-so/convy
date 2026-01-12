import { db } from "@/db";
import {
  subscriptionPlans,
  subscriptions,
  usageTracking,
} from "@/db/schema";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";

import { PlanId, BillingInterval, PLAN_PRICES_USD_CENTS } from "./types";

export type { PlanId, BillingInterval };
export { PLAN_PRICES_USD_CENTS };

export type PlanFeatures =
  typeof subscriptionPlans.$inferSelect["features"] & {
    id: PlanId;
    name: string;
  };

export const DEFAULT_PLAN_FEATURES: Record<PlanId, typeof subscriptionPlans.$inferSelect["features"]> =
  {
    free: {
      maxTextSurveys: 3,
      maxVoiceSurveys: 0,
      maxTextResponses: 50, // per survey
      maxVoiceResponses: 0,
      maxConcurrentParticipants: 0,
      maxWorkspaceMembers: 1,
      maxWorkspaces: 0, // No workspaces on free
      maxVoiceMinutesPerSession: 0,
      advancedAnalytics: true, // Free gets basic analytics
      customBranding: false,
      customDomain: false,
      embeddableWidget: false,
      uiCustomization: false,
      removeConvyBranding: false,
      customIntegrations: false,
      zapierIntegration: false,
      notionIntegration: false,
      slackIntegration: false,
      sso: false,
      dedicatedSupport: false,
      sla: false,
    },
    pro: {
      maxTextSurveys: 50,
      maxVoiceSurveys: 10,
      maxTextResponses: 100, // per survey
      maxVoiceResponses: 50, // per voice survey
      maxConcurrentParticipants: 50, // per voice survey
      maxWorkspaceMembers: 5, // per workspace
      maxWorkspaces: 5,
      maxVoiceMinutesPerSession: 10, // minutes per voice conversation
      advancedAnalytics: true,
      customBranding: false,
      customDomain: false,
      embeddableWidget: false,
      uiCustomization: false,
      removeConvyBranding: false,
      customIntegrations: false,
      zapierIntegration: false,
      notionIntegration: false,
      slackIntegration: false,
      sso: false,
      dedicatedSupport: false,
      sla: false,
    },
    premium: {
      maxTextSurveys: 100,
      maxVoiceSurveys: 50,
      maxTextResponses: 200, // per survey
      maxVoiceResponses: 100, // per voice survey
      maxConcurrentParticipants: 100, // per voice survey
      maxWorkspaceMembers: 20, // per workspace
      maxWorkspaces: 10,
      maxVoiceMinutesPerSession: 30, // minutes per voice conversation
      advancedAnalytics: true,
      customBranding: true, // Logo on forms
      customDomain: false,
      embeddableWidget: true,
      uiCustomization: true,
      removeConvyBranding: true,
      customIntegrations: false,
      zapierIntegration: true,
      notionIntegration: true,
      slackIntegration: true,
      sso: false,
      dedicatedSupport: true,
      sla: false,
    },
    enterprise: {
      maxTextSurveys: null, // unlimited
      maxVoiceSurveys: null, // unlimited
      maxTextResponses: null, // unlimited
      maxVoiceResponses: null, // unlimited
      maxConcurrentParticipants: null, // unlimited
      maxWorkspaceMembers: null, // unlimited
      maxWorkspaces: null, // unlimited
      maxVoiceMinutesPerSession: null, // unlimited
      advancedAnalytics: true,
      customBranding: true,
      customDomain: true,
      embeddableWidget: true,
      uiCustomization: true,
      removeConvyBranding: true,
      customIntegrations: true,
      zapierIntegration: true,
      notionIntegration: true,
      slackIntegration: true,
      sso: true,
      dedicatedSupport: true,
      sla: true,
    },
  };

/**
 * Ensure the subscription_plans table has the four core plans.
 * This is idempotent and safe to call on startup or first billing access.
 */
export async function ensurePlansSeeded(): Promise<void> {
  const existing = await db
    .select()
    .from(subscriptionPlans)
    .orderBy(subscriptionPlans.id);

  const existingIds = new Set(existing.map((p) => p.id));

  const toInsert: typeof subscriptionPlans.$inferInsert[] = [];

  const upsertPlan = (
    id: PlanId,
    name: string,
    interval: BillingInterval,
    priceMonthly: number,
    priceYearly: number | null
  ) => {
    const features = DEFAULT_PLAN_FEATURES[id];
    if (!existingIds.has(id)) {
      toInsert.push({
        id,
        name,
        interval,
        priceMonthly,
        priceYearly,
        currency: "USD",
        features,
      });
    }
  };

  // Free
  upsertPlan("free", "Free", "month", 0, 0);
  // Pro
  upsertPlan("pro", "Pro", "month", PLAN_PRICES_USD_CENTS.pro.monthly, PLAN_PRICES_USD_CENTS.pro.yearly);
  // Premium
  upsertPlan(
    "premium",
    "Premium",
    "month",
    PLAN_PRICES_USD_CENTS.premium.monthly,
    PLAN_PRICES_USD_CENTS.premium.yearly
  );
  // Enterprise (custom)
  upsertPlan("enterprise", "Enterprise", "month", 0, null);

  if (toInsert.length > 0) {
    await db.insert(subscriptionPlans).values(toInsert);
  }
}

export async function getPlanById(planId: PlanId) {
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId));
  return plan ?? null;
}

export async function getActiveSubscriptionForUser(
  userId: string,
  organizationId?: string | null
) {
  const now = new Date();

  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        organizationId
          ? eq(subscriptions.organizationId, organizationId)
          : isNull(subscriptions.organizationId),
        eq(subscriptions.status, "active"),
        gte(subscriptions.currentPeriodEnd, now) 
      )
    )
    .orderBy(desc(subscriptions.currentPeriodEnd));

  const activeSubscription = rows.find(sub => !sub.cancelAtPeriodEnd) ?? null;

  return activeSubscription;
}

export async function getUsageForPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  organizationId?: string | null
) {
  const [row] = await db
    .select()
    .from(usageTracking)
    .where(
      and(
        eq(usageTracking.userId, userId),
        organizationId
          ? eq(usageTracking.organizationId, organizationId)
          : isNull(usageTracking.organizationId),
        gte(usageTracking.periodStart, periodStart),
        lte(usageTracking.periodEnd, periodEnd)
      )
    );
  return row ?? null;
}


