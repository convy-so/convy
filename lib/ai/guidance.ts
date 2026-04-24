import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expertGuidancePacks,
  expertGuidanceVersions,
} from "@/db/schema";
import type { CoreAiFeature } from "@/lib/ai/observability";

export type ExpertGuidanceArtifact = {
  packId: string;
  packName: string;
  artifactType: string;
  versionId: string;
  version: number;
  targetScope: string;
  metadata: Record<string, unknown>;
  artifact: Record<string, unknown>;
  updatedAt: Date;
};

type GuidanceSelectors = {
  classroomId?: string | null;
  topicId?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  programId?: string | null;
  language?: string | null;
};

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  return typeof metadata?.[key] === "string" ? (metadata[key] as string) : null;
}

function scorePackScope(params: {
  targetScope: string;
  metadata: Record<string, unknown>;
  selectors?: GuidanceSelectors;
}) {
  const selectors = params.selectors;
  if (!selectors) return 1;

  const scope = params.targetScope;
  const metadata = params.metadata;

  if (scope === "global") return 1;

  if (scope === "classroom") {
    const classroomId = getMetadataString(metadata, "classroomId");
    return classroomId && classroomId === selectors.classroomId ? 7 : -1;
  }

  if (scope === "topic") {
    const topicId = getMetadataString(metadata, "topicId");
    return topicId && topicId === selectors.topicId ? 9 : -1;
  }

  if (scope === "subject") {
    const subjectKey = getMetadataString(metadata, "subjectKey");
    return subjectKey && subjectKey === selectors.subjectKey ? 6 : -1;
  }

  if (scope === "grade_band") {
    const gradeBand = getMetadataString(metadata, "gradeBand");
    return gradeBand && gradeBand === selectors.gradeBand ? 4 : -1;
  }

  if (scope === "program") {
    const programId = getMetadataString(metadata, "programId");
    return programId && programId === selectors.programId ? 6 : -1;
  }

  if (scope === "language") {
    const language = getMetadataString(metadata, "language");
    return language && language === selectors.language ? 3 : -1;
  }

  return 0;
}

export async function listActiveExpertGuidance(params: {
  feature: CoreAiFeature;
  artifactTypes?: string[];
  selectors?: GuidanceSelectors;
}) {
  const packs = await getDb()
    .select()
    .from(expertGuidancePacks)
    .where(
      params.artifactTypes && params.artifactTypes.length > 0
        ? and(
            eq(expertGuidancePacks.feature, params.feature),
            eq(expertGuidancePacks.status, "approved"),
            inArray(expertGuidancePacks.artifactType, params.artifactTypes),
          )
        : and(
            eq(expertGuidancePacks.feature, params.feature),
            eq(expertGuidancePacks.status, "approved"),
          ),
    )
    .orderBy(desc(expertGuidancePacks.updatedAt));

  if (packs.length === 0) {
    return [] as ExpertGuidanceArtifact[];
  }

  const activeVersionIds = packs.flatMap((pack) =>
    pack.activeVersionId ? [pack.activeVersionId] : [],
  );
  if (activeVersionIds.length === 0) {
    return [] as ExpertGuidanceArtifact[];
  }

  const versions = await getDb()
    .select()
    .from(expertGuidanceVersions)
    .where(inArray(expertGuidanceVersions.id, activeVersionIds));

  return packs.flatMap((pack) => {
    const version = versions.find((candidate) => candidate.id === pack.activeVersionId);
    if (!version) return [];

    return [
      {
        packId: pack.id,
        packName: pack.name,
        artifactType: pack.artifactType,
        versionId: version.id,
        version: version.version,
        targetScope: pack.targetScope,
        metadata: (pack.metadata as Record<string, unknown>) ?? {},
        artifact: (version.artifact as Record<string, unknown>) ?? {},
        updatedAt: version.updatedAt,
      },
    ];
  })
    .map((item) => ({
      item,
      score: scorePackScope({
        targetScope: item.targetScope,
        metadata: item.metadata,
        selectors: params.selectors,
      }),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || right.item.updatedAt.getTime() - left.item.updatedAt.getTime())
    .map((entry) => entry.item);
}

export function renderExpertGuidanceContext(guidance: ExpertGuidanceArtifact[]) {
  if (guidance.length === 0) return "";

  return guidance
    .map((item) => {
      const artifactLines = Object.entries(item.artifact)
        .map(([key, value]) => `- ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join("\n");

      return [
        `[${item.artifactType}] ${item.packName}`,
        `- scope: ${item.targetScope}`,
        artifactLines,
      ].join("\n");
    })
    .join("\n\n");
}
