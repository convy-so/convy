import { db } from "@/db";
import {
  subscriptionPlans,
  subscriptions,
  usageTracking,
  type subscriptionPlans as SubscriptionPlanTable,
} from "@/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { PlanId, BillingInterval, PLAN_PRICES_USD_CENTS } from "./types";

export type { PlanId, BillingInterval };
export { PLAN_PRICES_USD_CENTS };

export type PlanFeatures =
  typeof subscriptionPlans.$inferSelect["features"] & {
    id: PlanId;
    name: string;
  };

export const DEFAULT_PLAN_FEATURES: Record<PlanId, SubscriptionPlanTable["features"]> =
  {
    free: {
      maxTextSurveys: 3,
      maxVoiceSurveys: 0,
      maxTextResponses: 50, // per survey
      maxVoiceResponses: 0,
      maxConcurrentParticipants: 0,
      maxWorkspaceMembers: 1,
      advancedAnalytics: false,
      customBranding: false,
      customDomain: false,
      embeddableWidget: false,
      uiCustomization: false,
      removeConvyBranding: false,
      customIntegrations: false,
      sso: false,
      dedicatedSupport: false,
      sla: false,
    },
    pro: {
      maxTextSurveys: null, // unlimited
      maxVoiceSurveys: 5,
      maxTextResponses: null, // unlimited
      maxVoiceResponses: 50, // per voice survey
      maxConcurrentParticipants: 25,
      maxWorkspaceMembers: 3,
      advancedAnalytics: true,
      customBranding: false,
      customDomain: false,
      embeddableWidget: false,
      uiCustomization: false,
      removeConvyBranding: false,
      customIntegrations: false,
      sso: false,
      dedicatedSupport: false,
      sla: false,
    },
    premium: {
      maxTextSurveys: null,
      maxVoiceSurveys: null,
      maxTextResponses: null,
      maxVoiceResponses: null,
      maxConcurrentParticipants: 100,
      maxWorkspaceMembers: 10,
      advancedAnalytics: true,
      customBranding: true,
      customDomain: true,
      embeddableWidget: true,
      uiCustomization: true,
      removeConvyBranding: true,
      customIntegrations: false,
      sso: false,
      dedicatedSupport: true,
      sla: false,
    },
    enterprise: {
      maxTextSurveys: null,
      maxVoiceSurveys: null,
      maxTextResponses: null,
      maxVoiceResponses: null,
      maxConcurrentParticipants: null,
      maxWorkspaceMembers: null,
      advancedAnalytics: true,
      customBranding: true,
      customDomain: true,
      embeddableWidget: true,
      uiCustomization: true,
      removeConvyBranding: true,
      customIntegrations: true,
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
          : eq(subscriptions.organizationId, null),
        gte(subscriptions.currentPeriodEnd, now)
      )
    )
    .orderBy(desc(subscriptions.currentPeriodEnd));

  return rows[0] ?? null;
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
          : eq(usageTracking.organizationId, null),
        gte(usageTracking.periodStart, periodStart),
        lte(usageTracking.periodEnd, periodEnd)
      )
    );
  return row ?? null;
}


