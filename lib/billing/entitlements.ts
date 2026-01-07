import {
  ensurePlansSeeded,
  getActiveSubscriptionForUser,
  getPlanById,
} from "./plans";
import { db } from "@/db";
import { surveys } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getWorkspaceOwnerId } from "@/lib/workspace-access";

type EntitlementContext = {
  userId: string;
  organizationId?: string | null;
};

export type Entitlements = {
  planId: string;
  features: Awaited<ReturnType<typeof getPlanById>>["features"];
};

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function getEntitlements(
  ctx: EntitlementContext
): Promise<Entitlements> {
  await ensurePlansSeeded();

  let targetUserId = ctx.userId;
  
  if (ctx.organizationId) {
    const ownerId = await getWorkspaceOwnerId(ctx.organizationId);
    if (ownerId) {
      targetUserId = ownerId;
    }
  }

  const subscription = await getActiveSubscriptionForUser(
    targetUserId,
    ctx.organizationId
  );

  const planId = (subscription?.planId as any) ?? "free";
  const plan = await getPlanById(planId as any);

  if (!plan) {
    throw new Error(`Plan configuration missing for planId=${planId}`);
  }

  return {
    planId,
    features: plan.features,
  };
}

export async function assertCanCreateTextSurvey(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (features.maxTextSurveys == null) {
    return;
  }

  let conditions;

  if (ctx.organizationId) {
    // Count surveys in the workspace
    conditions = eq(surveys.organizationId, ctx.organizationId);
  } else {
    // Count personal surveys
    conditions = and(
      eq(surveys.userId, ctx.userId), 
      isNull(surveys.organizationId)
    );
  }

  const rows = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(conditions);

  const count = rows.length;

  if (count >= features.maxTextSurveys) {
    throw new PlanLimitError(
      "You have reached the maximum number of text surveys for your plan."
    );
  }
}

export async function assertCanUseCustomUrl(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  // Custom URLs / custom domains are available on plans that support branding
  if (!features.customDomain && !features.removeConvyBranding) {
    throw new PlanLimitError(
      "Custom survey URLs are not available on your current plan."
    );
  }
}

export async function assertCanUseEmbedWidget(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (!features.embeddableWidget) {
    throw new PlanLimitError(
      "Embeddable survey widgets are not available on your current plan."
    );
  }
}


