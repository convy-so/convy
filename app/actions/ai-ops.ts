"use server";

import { count, desc, eq, gte, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  aiRuns,
  evalCases,
  evalRuns,
  evalDatasets,
  expertGuidancePacks,
  expertGuidanceVersions,
  failureLabels,
  failureModes,
} from "@/db/schema";
import {
  buildFeatureRubric,
  getEvalBlueprint,
  validateEvalCaseForFeature,
} from "@/lib/ai/eval-catalog";
import { enqueueEvalRun } from "@/lib/queue";
import { getVerifiedSession } from "@/lib/auth/session";
import { hasAiOpsAccess } from "@/lib/auth/expert";
import { getPlatformRole } from "@/lib/auth/roles";
import type { CoreAiFeature } from "@/lib/ai/observability";

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

function hasExecutableEvalOutput(input: Record<string, unknown>) {
  return (
    typeof input.aiRunId === "string" ||
    typeof input.outputText === "string" ||
    (typeof input.actualOutput === "object" && input.actualOutput !== null) ||
    (typeof input.candidateOutput === "object" &&
      input.candidateOutput !== null) ||
    (typeof input.output === "object" && input.output !== null)
  );
}

export async function getAiOpsOverview(authHeaders?: Headers | string | null) {
  const session = await requireAiOpsSession(authHeaders);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalRuns,
    weeklyRuns,
    failedRuns,
    datasets,
    guidancePacks,
    failureModeCount,
    featureBreakdown,
  ] = await Promise.all([
    getDb().select({ value: count() }).from(aiRuns),
    getDb()
      .select({ value: count() })
      .from(aiRuns)
      .where(gte(aiRuns.createdAt, sevenDaysAgo)),
    getDb()
      .select({ value: count() })
      .from(aiRuns)
      .where(eq(aiRuns.status, "failed")),
    getDb().select({ value: count() }).from(evalDatasets),
    getDb().select({ value: count() }).from(expertGuidancePacks),
    getDb().select({ value: count() }).from(failureModes),
    getDb()
      .select({
        feature: aiRuns.feature,
        runs: count(),
      })
      .from(aiRuns)
      .groupBy(aiRuns.feature)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
  ]);

  return {
    viewerRole: getPlatformRole(session.user),
    totalRuns: totalRuns[0]?.value ?? 0,
    weeklyRuns: weeklyRuns[0]?.value ?? 0,
    failedRuns: failedRuns[0]?.value ?? 0,
    evalDatasetCount: datasets[0]?.value ?? 0,
    guidancePackCount: guidancePacks[0]?.value ?? 0,
    failureModeCount: failureModeCount[0]?.value ?? 0,
    featureBreakdown,
  };
}

export async function listRecentAiRuns(
  authHeaders?: Headers | string | null,
  limit = 30,
) {
  await requireAiOpsSession(authHeaders);

  return await getDb().query.aiRuns.findMany({
    orderBy: [desc(aiRuns.createdAt)],
    limit,
  });
}

export async function listRecentEvalRuns(
  authHeaders?: Headers | string | null,
  limit = 20,
) {
  await requireAiOpsSession(authHeaders);

  return await getDb().query.evalRuns.findMany({
    orderBy: [desc(evalRuns.createdAt)],
    limit,
  });
}

export async function listFailureModeSummary(
  authHeaders?: Headers | string | null,
  limit = 20,
) {
  await requireAiOpsSession(authHeaders);

  return await getDb()
    .select({
      id: failureModes.id,
      feature: failureModes.feature,
      code: failureModes.code,
      title: failureModes.title,
      severity: failureModes.severity,
      ontologyVersion: failureModes.ontologyVersion,
      labelCount: sql<number>`count(${failureLabels.id})::int`,
    })
    .from(failureModes)
    .leftJoin(failureLabels, eq(failureLabels.failureModeId, failureModes.id))
    .groupBy(
      failureModes.id,
      failureModes.feature,
      failureModes.code,
      failureModes.title,
      failureModes.severity,
      failureModes.ontologyVersion,
    )
    .orderBy(desc(sql`count(${failureLabels.id})`))
    .limit(limit);
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

export async function createEvalDataset(input: {
  feature: CoreAiFeature;
  name: string;
  description?: string | null;
  datasetKind?: string;
  metadata?: Record<string, unknown>;
}) {
  const session = await requireAiOpsSession();
  const blueprint = getEvalBlueprint(input.feature);
  const [dataset] = await getDb()
    .insert(evalDatasets)
    .values({
      id: nanoid(),
      feature: input.feature,
      name: input.name,
      description: input.description ?? null,
      status: "draft",
      datasetKind: input.datasetKind ?? "offline",
      ownedByRole: getPlatformRole(session.user),
      createdByUserId: session.user.id,
      rubricSetVersion: blueprint?.rubricSetVersion ?? null,
      metadata: {
        blueprint:
          blueprint == null
            ? null
            : {
                rubricSetVersion: blueprint.rubricSetVersion,
                targetPassRate: blueprint.targetPassRate,
                releaseBlockerFloor: blueprint.releaseBlockerFloor,
                requiredTags: blueprint.requiredTags,
              },
        ...(input.metadata ?? {}),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return dataset;
}

export async function addEvalCase(input: {
  datasetId: string;
  caseKey: string;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  rubric?: Record<string, unknown>;
  tags?: string[];
}) {
  await requireAiOpsSession();

  const dataset = await getDb().query.evalDatasets.findFirst({
    where: eq(evalDatasets.id, input.datasetId),
  });
  if (!dataset) {
    throw new Error("Eval dataset not found");
  }
  if (!hasExecutableEvalOutput(input.input)) {
    throw new Error(
      "This eval case does not include an executable output source. Add one of: aiRunId, outputText, actualOutput, candidateOutput, or output.",
    );
  }

  const defaultRubric = buildFeatureRubric(dataset.feature as CoreAiFeature);
  const finalRubric =
    input.rubric && Object.keys(input.rubric).length > 0
      ? {
          ...defaultRubric,
          ...input.rubric,
        }
      : defaultRubric;
  const validation = validateEvalCaseForFeature({
    feature: dataset.feature as CoreAiFeature,
    tags: input.tags ?? [],
    rubric: finalRubric,
  });
  if (!validation.valid) {
    throw new Error(
      `Eval case is missing required educational coverage. Missing tags: ${validation.missingTags.join(", ") || "none"}. Missing rubric dimensions: ${validation.missingDimensions.join(", ") || "none"}.`,
    );
  }

  const [evalCase] = await getDb()
    .insert(evalCases)
    .values({
      id: nanoid(),
      datasetId: input.datasetId,
      caseKey: input.caseKey,
      input: input.input,
      expectedOutput: input.expectedOutput ?? {},
      rubric: finalRubric,
      tags: input.tags ?? [],
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return evalCase;
}

export async function createEvalRun(input: {
  datasetId?: string | null;
  feature: CoreAiFeature;
  targetVersionId?: string | null;
  summary?: Record<string, unknown>;
}) {
  const session = await requireAiOpsSession();
  if (!input.datasetId) {
    throw new Error(
      "Manual eval runs currently require a dataset so the educational quality bar is explicit and reproducible.",
    );
  }

  const blueprint = getEvalBlueprint(input.feature);
  const [run] = await getDb()
    .insert(evalRuns)
    .values({
      id: nanoid(),
      datasetId: input.datasetId ?? null,
      triggerType: "manual",
      feature: input.feature,
      status: "queued",
      triggeredByUserId: session.user.id,
      targetVersionId: input.targetVersionId ?? null,
      summary: {
        blueprint:
          blueprint == null
            ? null
            : {
                rubricSetVersion: blueprint.rubricSetVersion,
                targetPassRate: blueprint.targetPassRate,
                releaseBlockerFloor: blueprint.releaseBlockerFloor,
              },
        ...(input.summary ?? {}),
      },
      startedAtIso: null,
      completedAtIso: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await enqueueEvalRun({
    evalRunId: run.id,
    datasetId: input.datasetId,
    feature: input.feature,
    triggeredByUserId: session.user.id,
  });

  return run;
}
