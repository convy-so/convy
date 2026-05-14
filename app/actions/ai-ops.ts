"use server";

import { count, desc, eq} from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  expertGuidancePacks,
  expertGuidanceVersions,
  fewShotExamples,
} from "@/db/schema";
import { resolveAdminSessionEmail } from "@/lib/admin/session";
import { getVerifiedSession } from "@/lib/auth/dal";
import { isExpert } from "@/lib/auth/dal";
import { getPlatformRole } from "@/lib/auth/dal";
import { type AuthSessionWithUser } from "@/lib/auth";
import { indexFewShotExample } from "@/lib/ai/few-shot-library";
import type { CoreAiFeature } from "@/lib/ai/types";
import { countExpertEvalDatasets } from "@/lib/learning/expert-eval-storage";
import { withErrorHandling, ActionResult, UnauthorizedError, NotFoundError } from "@/lib/action-wrapper";
import { InferSelectModel } from "drizzle-orm";

export type GuidancePack = InferSelectModel<typeof expertGuidancePacks>;
export type GuidanceVersion = InferSelectModel<typeof expertGuidanceVersions>;
export type FewShotExample = InferSelectModel<typeof fewShotExamples>;

async function requireAiOpsSession(authHeaders?: Headers | string | null) {
  let cookieHeader: string | null = null;

  if (typeof authHeaders === "string") {
    cookieHeader = authHeaders;
  } else if (authHeaders instanceof Headers) {
    cookieHeader = authHeaders.get("cookie");
  } else {
    cookieHeader = (await headers()).get("cookie");
  }

  // Allow bypass for the secret admin portal
  if (cookieHeader) {
    const email = await resolveAdminSessionEmail(cookieHeader);
    if (email) {
      const mockUser: AuthSessionWithUser["user"] = {
        id: "admin-system",
        email: email.toLowerCase(),
        emailVerified: true,
        name: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        role: "admin",
        banned: false,
        banReason: null,
        banExpires: null,
        uiLocale: undefined,
        preferredLanguage: undefined,
      };

      const mockSession: AuthSessionWithUser["session"] = {
        id: "admin-system-session",
        userId: "admin-system",
        expiresAt: new Date(Date.now() + 3600000),
        token: "admin-system-token",
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "AdminPortal",
      };

      return {
        user: mockUser,
        session: mockSession,
      };
    }
  }

  const session = await getVerifiedSession(cookieHeader);
  if (!isExpert(session.user)) {
    throw new UnauthorizedError("Expert or admin access required");
  }

  return session;
}

export async function getAiOpsOverview(authHeaders?: Headers | string | null): Promise<ActionResult<{
  viewerRole: string;
  totalRuns: number;
  weeklyRuns: number;
  failedRuns: number;
  evalDatasetCount: number;
  guidancePackCount: number;
  failureModeCount: number;
  featureBreakdown: unknown[];
}>> {
  return withErrorHandling(async () => {
    const session = await requireAiOpsSession(authHeaders);

    const [guidancePacksResult, evalDatasetCount] = await Promise.all([
      getDb().select({ value: count() }).from(expertGuidancePacks),
      countExpertEvalDatasets(),
    ]);

    return {
      success: true,
      data: {
        viewerRole: getPlatformRole(session.user),
        totalRuns: 0,
        weeklyRuns: 0,
        failedRuns: 0,
        evalDatasetCount,
        guidancePackCount: guidancePacksResult[0]?.value ?? 0,
        failureModeCount: 0,
        featureBreakdown: [],
      },
    };
  }, "getAiOpsOverview");
}

export async function listExpertGuidanceSummary(
  authHeaders?: Headers | string | null,
): Promise<ActionResult<GuidancePack[]>> {
  return withErrorHandling(async () => {
    await requireAiOpsSession(authHeaders);

    const data = await getDb().query.expertGuidancePacks.findMany({
      orderBy: [desc(expertGuidancePacks.updatedAt)],
      limit: 20,
    });
    return { success: true, data };
  }, "listExpertGuidanceSummary");
}

export async function createExpertGuidancePack(input: {
  feature: CoreAiFeature;
  artifactType: string;
  name: string;
  description?: string | null;
  targetScope?: string;
  metadata?: Record<string, unknown>;
}): Promise<ActionResult<GuidancePack>> {
  return withErrorHandling(async () => {
    const session = await requireAiOpsSession();
    const [pack] = await getDb()
      .insert(expertGuidancePacks)
      .values({
        id: nanoid(),
        feature: input.feature,
        artifactType: input.artifactType,
        status: "draft",
        name: input.name,
        description: input.description ?? null,
        targetScope: input.targetScope ?? "global",
        createdByUserId: session.user.id,
        activeVersionId: null,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { success: true, data: pack };
  }, "createExpertGuidancePack");
}

export async function createExpertGuidanceVersion(input: {
  packId: string;
  artifact: Record<string, unknown>;
  notes?: string | null;
}): Promise<ActionResult<GuidanceVersion>> {
  return withErrorHandling(async () => {
    const session = await requireAiOpsSession();
    const pack = await getDb().query.expertGuidancePacks.findFirst({
      where: eq(expertGuidancePacks.id, input.packId),
    });

    if (!pack) {
      throw new NotFoundError("Guidance pack not found");
    }

    const existingVersions = await getDb().query.expertGuidanceVersions.findMany({
      where: eq(expertGuidanceVersions.packId, input.packId),
      orderBy: [desc(expertGuidanceVersions.version)],
      limit: 1,
    });
    const nextVersion = (existingVersions[0]?.version ?? 0) + 1;

    const [version] = await getDb()
      .insert(expertGuidanceVersions)
      .values({
        id: nanoid(),
        packId: input.packId,
        version: nextVersion,
        status: "draft",
        artifact: input.artifact,
        notes: input.notes ?? null,
        createdByUserId: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await getDb()
      .update(expertGuidancePacks)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(expertGuidancePacks.id, input.packId));

    return { success: true, data: version };
  }, "createExpertGuidanceVersion");
}

export async function activateExpertGuidanceVersion(input: {
  packId: string;
  versionId: string;
}): Promise<ActionResult<{ packId: string; versionId: string; status: "approved" }>> {
  return withErrorHandling(async () => {
    await requireAiOpsSession();

    const version = await getDb().query.expertGuidanceVersions.findFirst({
      where: eq(expertGuidanceVersions.id, input.versionId),
    });
    if (!version || version.packId !== input.packId) {
      throw new NotFoundError("Guidance version not found");
    }

    await getDb()
      .update(expertGuidanceVersions)
      .set({
        status: "approved",
        updatedAt: new Date(),
      })
      .where(eq(expertGuidanceVersions.id, input.versionId));

    await getDb()
      .update(expertGuidancePacks)
      .set({
        activeVersionId: input.versionId,
        status: "approved",
        updatedAt: new Date(),
      })
      .where(eq(expertGuidancePacks.id, input.packId));

    return {
      success: true,
      data: {
        packId: input.packId,
        versionId: input.versionId,
        status: "approved" as const,
      },
    };
  }, "activateExpertGuidanceVersion");
}

export async function listExpertFewShotExamples(
  authHeaders?: Headers | string | null,
): Promise<ActionResult<FewShotExample[]>> {
  return withErrorHandling(async () => {
    await requireAiOpsSession(authHeaders);

    const data = await getDb().query.fewShotExamples.findMany({
      orderBy: [desc(fewShotExamples.updatedAt)],
      limit: 50,
    });
    return { success: true, data };
  }, "listExpertFewShotExamples");
}

export async function createExpertFewShotExample(input: {
  feature: string;
  tags: string[];
  content: Record<string, unknown>;
  isActive?: boolean;
}): Promise<ActionResult<FewShotExample>> {
  return withErrorHandling(async () => {
    const session = await requireAiOpsSession();
    const [example] = await getDb()
      .insert(fewShotExamples)
      .values({
        id: nanoid(),
        feature: input.feature,
        tags: input.tags,
        content: input.content,
        isActive: input.isActive ?? true,
        createdByUserId: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Kick off embedding + retrieval content indexing immediately
    await indexFewShotExample({
      id: example.id,
      feature: input.feature,
      tags: input.tags,
      content: input.content,
    });

    return { success: true, data: example };
  }, "createExpertFewShotExample");
}
