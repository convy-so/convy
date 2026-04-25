"use server";

import { count, desc, eq} from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  expertGuidancePacks,
  expertGuidanceVersions,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { hasAiOpsAccess } from "@/lib/auth/expert";
import { getPlatformRole } from "@/lib/auth/roles";
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

function readMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  return typeof metadata?.[key] === "string" ? (metadata[key] as string) : null;
}

function getPackScopeValidation(pack: {
  targetScope: string;
  metadata: Record<string, unknown> | null;
}) {
  const metadata = pack.metadata ?? {};

  switch (pack.targetScope) {
    case "global":
      return { valid: true, reason: null as string | null };
    case "classroom":
      return {
        valid: Boolean(readMetadataString(metadata, "classroomId")),
        reason: "classroom-scoped packs must include metadata.classroomId",
      };
    case "topic":
      return {
        valid: Boolean(readMetadataString(metadata, "topicId")),
        reason: "topic-scoped packs must include metadata.topicId",
      };
    case "subject":
      return {
        valid: Boolean(readMetadataString(metadata, "subjectKey")),
        reason: "subject-scoped packs must include metadata.subjectKey",
      };
    case "grade_band":
      return {
        valid: Boolean(readMetadataString(metadata, "gradeBand")),
        reason: "grade-band-scoped packs must include metadata.gradeBand",
      };
    case "language":
      return {
        valid: Boolean(readMetadataString(metadata, "language")),
        reason: "language-scoped packs must include metadata.language",
      };
    case "program":
      return {
        valid: Boolean(readMetadataString(metadata, "programId")),
        reason: "program-scoped packs must include metadata.programId",
      };
    default:
      return {
        valid: false,
        reason: `Unsupported target scope: ${pack.targetScope}`,
      };
  }
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
