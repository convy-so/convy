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
  // FREEZE: Temporarily returning enterprise features for all users to test functionality
  // without payment restrictions.
  const { DEFAULT_PLAN_FEATURES } = await import("./plans");
  return {
    planId: "enterprise",
    features: DEFAULT_PLAN_FEATURES.enterprise,
  };

  /* 
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
  */
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

/**
 * ✅ NEW: Check if user can create voice surveys
 */
export async function assertCanCreateVoiceSurvey(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (features.maxVoiceSurveys === 0 || features.maxVoiceSurveys === null) {
    if (features.maxVoiceSurveys === 0) {
      throw new PlanLimitError(
        "Voice surveys are not available on your current plan. Upgrade to Pro or higher."
      );
    }
    return;
  }

  // Count existing voice surveys
  const voiceSurveys = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(
      ctx.organizationId
        ? and(
            eq(surveys.organizationId, ctx.organizationId),
            eq(surveys.status, "active") // Only count active voice surveys
          )
        : and(
            eq(surveys.userId, ctx.userId),
            isNull(surveys.organizationId),
            eq(surveys.status, "active")
          )
    );

  // TODO: Need to distinguish voice vs text surveys in schema
  // For now, check if survey has voice enabled (would need a field)
  // This is a placeholder - actual implementation needs voice survey flag
  const count = voiceSurveys.length;

  if (count >= features.maxVoiceSurveys) {
    throw new PlanLimitError(
      `You have reached the maximum number of voice surveys (${features.maxVoiceSurveys}) for your plan.`
    );
  }
}

/**
 * ✅ NEW: Check if user can have concurrent participants in voice survey
 */
export async function assertCanAddVoiceParticipant(
  ctx: EntitlementContext,
  currentCount: number
) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (features.maxConcurrentParticipants === null) {
    return; 
  }

  if (currentCount >= features.maxConcurrentParticipants) {
    throw new PlanLimitError(
      `Maximum concurrent participants (${features.maxConcurrentParticipants}) reached for this survey.`
    );
  }
}

/**
 * ✅ NEW: Check if voice conversation duration is within limit
 */
export async function assertVoiceDurationAllowed(
  ctx: EntitlementContext,
  durationMinutes: number
) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (features.maxVoiceMinutesPerSession === null) {
    return; 
  }

  if (durationMinutes > features.maxVoiceMinutesPerSession) {
    throw new PlanLimitError(
      `Voice conversation duration (${durationMinutes} min) exceeds plan limit (${features.maxVoiceMinutesPerSession} min per session).`
    );
  }
}

/**
 * ✅ NEW: Check if user can add participants to text survey
 */
export async function assertCanAddTextParticipant(
  ctx: EntitlementContext,
  surveyId: string,
  currentCount: number
) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (features.maxTextResponses === null) {
    return; // Unlimited
  }

  if (currentCount >= features.maxTextResponses) {
    throw new PlanLimitError(
      `Maximum participants (${features.maxTextResponses}) reached for this survey.`
    );
  }
}

/**
 * ✅ NEW: Check if user can use Zapier integration
 */
export async function assertCanUseZapier(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (!features.zapierIntegration) {
    throw new PlanLimitError(
      "Zapier integration is not available on your current plan. Upgrade to Premium or higher."
    );
  }
}

/**
 * ✅ NEW: Check if user can use Notion integration
 */
export async function assertCanUseNotion(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (!features.notionIntegration) {
    throw new PlanLimitError(
      "Notion integration is not available on your current plan. Upgrade to Premium or higher."
    );
  }
}

/**
 * ✅ NEW: Check if user can use Slack integration
 */
export async function assertCanUseSlack(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (!features.slackIntegration) {
    throw new PlanLimitError(
      "Slack integration is not available on your current plan. Upgrade to Premium or higher."
    );
  }
}

/**
 * ✅ NEW: Check if user can create workspaces
 */
export async function assertCanCreateWorkspace(ctx: EntitlementContext) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (features.maxWorkspaces === 0) {
    throw new PlanLimitError(
      "Workspaces are not available on your current plan. Upgrade to Pro or higher."
    );
  }

  if (features.maxWorkspaces === null) {
    return; // Unlimited
  }

  // Count existing workspaces owned by user
  const { organizations, members } = await import("@/db/schema");
  const workspaceCount = await db
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(members, eq(organizations.id, members.organizationId))
    .where(
      and(
        eq(members.userId, ctx.userId),
        eq(members.role, "owner")
      )
    );

  if (workspaceCount.length >= features.maxWorkspaces) {
    throw new PlanLimitError(
      `You have reached the maximum number of workspaces (${features.maxWorkspaces}) for your plan.`
    );
  }
}

/**
 * ✅ NEW: Check if user can add members to workspace
 */
export async function assertCanAddWorkspaceMember(
  ctx: EntitlementContext,
  currentMemberCount: number
) {
  const entitlements = await getEntitlements(ctx);
  const { features } = entitlements;

  if (features.maxWorkspaceMembers === null) {
    return; // Unlimited
  }

  if (currentMemberCount >= features.maxWorkspaceMembers) {
    throw new PlanLimitError(
      `Maximum workspace members (${features.maxWorkspaceMembers}) reached.`
    );
  }
}


