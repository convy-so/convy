"use server";

import { count, desc, eq} from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";

import { getRedisClient } from "@/lib/redis";
import { env } from "@/lib/env";
import { getDb } from "@/db";
import {
  expertGuidancePacks,
  expertGuidanceVersions,
  fewShotExamples,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { hasAiOpsAccess } from "@/lib/auth/expert";
import { getPlatformRole } from "@/lib/auth/roles";
import { indexFewShotExample } from "@/lib/ai/few-shot-library";
import type { CoreAiFeature } from "@/lib/ai/types";

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
    const match = cookieHeader.match(/admin_session=([^;]+)/);
    if (match) {
      const token = match[1];
      const redis = getRedisClient();
      const email = await redis.get(`admin_session:${token}`);
      if (email && env.ADMIN_EMAILS.includes(email.toLowerCase())) {
        return {
          user: {
            id: "admin-system",
            email: email.toLowerCase(),
            role: "admin",
            emailVerified: true,
            name: "Admin",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          session: {} as any,
        } as any;
      }
    }
  }

  const session = await getVerifiedSession(cookieHeader);
  if (!hasAiOpsAccess(session.user)) {
    throw new Error("Unauthorized: Expert or admin access required");
  }

  return session;
}

export async function getAiOpsOverview(authHeaders?: Headers | string | null) {
  const session = await requireAiOpsSession(authHeaders);

  const [
    guidancePacks,
  ] = await Promise.all([
    getDb().select({ value: count() }).from(expertGuidancePacks),
  ]);

  return {
    viewerRole: getPlatformRole(session.user),
    totalRuns: 0,
    weeklyRuns: 0,
    failedRuns: 0,
    evalDatasetCount: 0,
    guidancePackCount: guidancePacks[0]?.value ?? 0,
    failureModeCount: 0,
    featureBreakdown: [],
  };
}

export async function listExpertGuidanceSummary(
  authHeaders?: Headers | string | null,
) {
  await requireAiOpsSession(authHeaders);

  return await getDb().query.expertGuidancePacks.findMany({
    orderBy: [desc(expertGuidancePacks.updatedAt)],
    limit: 20,
  });
}

export async function createExpertGuidancePack(input: {
  feature: CoreAiFeature;
  artifactType: string;
  name: string;
  description?: string | null;
  targetScope?: string;
  metadata?: Record<string, unknown>;
}) {
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

  return pack;
}

export async function createExpertGuidanceVersion(input: {
  packId: string;
  artifact: Record<string, unknown>;
  notes?: string | null;
}) {
  const session = await requireAiOpsSession();
  const pack = await getDb().query.expertGuidancePacks.findFirst({
    where: eq(expertGuidancePacks.id, input.packId),
  });

  if (!pack) {
    throw new Error("Guidance pack not found");
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

  return version;
}

export async function activateExpertGuidanceVersion(input: {
  packId: string;
  versionId: string;
}) {
  await requireAiOpsSession();

  const version = await getDb().query.expertGuidanceVersions.findFirst({
    where: eq(expertGuidanceVersions.id, input.versionId),
  });
  if (!version || version.packId !== input.packId) {
    throw new Error("Guidance version not found");
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
    packId: input.packId,
    versionId: input.versionId,
    status: "approved" as const,
  };
}

export async function listExpertFewShotExamples(
  authHeaders?: Headers | string | null,
) {
  await requireAiOpsSession(authHeaders);

  return await getDb().query.fewShotExamples.findMany({
    orderBy: [desc(fewShotExamples.updatedAt)],
    limit: 50,
  });
}

export async function createExpertFewShotExample(input: {
  feature: string;
  tags: string[];
  content: Record<string, unknown>;
  isActive?: boolean;
}) {
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

  // Kick off embedding + retrieval content indexing immediately so the
  // new example is searchable via HNSW + BM25 on the very next request.
  await indexFewShotExample({
    id: example.id,
    feature: input.feature,
    tags: input.tags,
    content: input.content,
  });

  return example;
}
