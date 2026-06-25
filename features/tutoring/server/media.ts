import { and, asc, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import {
  teachingMediaAssets,
  teachingMediaBindings,
  teachingMediaUsageEvents,
} from "@/shared/db/schema";
import { LEARNING_STATUS } from "@/shared/learning/constants";

export type TutorMediaRecommendation = {
  assetId?: string | null;
  assetType: "image" | "video";
  title: string;
  description: string | null;
  mediaUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  selectionSource: "teacher_curated" | "internal_catalog" | "external_catalog";
  reason: string;
  expectedBenefit: string;
  followUpPrompt: string;
  transcript: string | null;
};

function shouldOfferMedia(params: {
  currentPhaseType: string | null;
  gapCount: number;
  conceptTitle: string | null;
}) {
  if (!params.conceptTitle) return false;
  if (params.currentPhaseType === "quiz" || params.currentPhaseType === "self_reflection") {
    return false;
  }
  return params.gapCount > 0 || params.currentPhaseType === "concept_teaching";
}

function inferPreferredAssetType(params: {
  currentPhaseType: string | null;
  gapCount: number;
}) {
  if (params.currentPhaseType === "concept_teaching" && params.gapCount > 0) {
    return "video";
  }

  return "image";
}

export async function selectTutorMedia(params: {
  topicId: string;
  classroomId: string;
  gradeBand: string;
  currentPhaseType: string | null;
  conceptKey?: string | null;
  conceptTitle?: string | null;
  gapCount: number;
}) {
  if (
    !shouldOfferMedia({
      currentPhaseType: params.currentPhaseType,
      gapCount: params.gapCount,
      conceptTitle: params.conceptTitle ?? null,
    })
  ) {
    return null;
  }

  const preferredType = inferPreferredAssetType({
    currentPhaseType: params.currentPhaseType,
    gapCount: params.gapCount,
  });

  const bindings = await getDb()
    .select({
      bindingId: teachingMediaBindings.id,
      assetId: teachingMediaAssets.id,
      assetType: teachingMediaAssets.assetType,
      title: teachingMediaAssets.title,
      description: teachingMediaAssets.description,
      mediaUrl: teachingMediaAssets.mediaUrl,
      thumbnailUrl: teachingMediaAssets.thumbnailUrl,
      durationSeconds: teachingMediaAssets.durationSeconds,
      transcript: teachingMediaAssets.transcript,
      sourceType: teachingMediaAssets.sourceType,
      priority: teachingMediaBindings.priority,
      conceptKey: teachingMediaBindings.conceptKey,
      phaseType: teachingMediaBindings.phaseType,
    })
    .from(teachingMediaBindings)
    .innerJoin(teachingMediaAssets, eq(teachingMediaBindings.assetId, teachingMediaAssets.id))
    .where(
      and(
        eq(teachingMediaAssets.status, LEARNING_STATUS.teachingMediaApproved),
        eq(teachingMediaAssets.assetType, preferredType),
        or(
          eq(teachingMediaBindings.topicId, params.topicId),
          and(isNull(teachingMediaBindings.topicId), eq(teachingMediaBindings.classroomId, params.classroomId)),
        ),
        or(
          isNull(teachingMediaBindings.gradeBand),
          eq(teachingMediaBindings.gradeBand, params.gradeBand),
        ),
        or(
          isNull(teachingMediaBindings.phaseType),
          eq(teachingMediaBindings.phaseType, params.currentPhaseType ?? ""),
        ),
        or(
          isNull(teachingMediaBindings.conceptKey),
          eq(teachingMediaBindings.conceptKey, params.conceptKey ?? ""),
        ),
      ),
    )
    .orderBy(asc(teachingMediaBindings.priority), asc(teachingMediaAssets.createdAt))
    .limit(1);

  const curated = bindings[0];
  if (curated) {
    return {
      assetId: curated.assetId,
      assetType: curated.assetType as "image" | "video",
      title: curated.title,
      description: curated.description,
      mediaUrl: curated.mediaUrl,
      thumbnailUrl: curated.thumbnailUrl,
      durationSeconds: curated.durationSeconds,
      transcript: curated.transcript,
      selectionSource:
        curated.sourceType === "internal_catalog" ? "internal_catalog" : "teacher_curated",
      reason: `This ${curated.assetType} directly supports ${params.conceptTitle ?? "the current concept"} during ${params.currentPhaseType ?? "the current phase"}.`,
      expectedBenefit:
        curated.assetType === "video"
          ? "A short visual walkthrough can make the explanation easier to anchor."
          : "A focused visual reference can reduce abstraction and make the concept easier to picture.",
      followUpPrompt: `After looking at ${curated.title}, what part makes more sense now?`,
    } satisfies TutorMediaRecommendation;
  }

  return null;
}

export async function logTutorMediaUsage(params: {
  topicId: string;
  sessionId: string;
  classroomStudentId: string;
  recommendation: TutorMediaRecommendation;
}) {
  await getDb().insert(teachingMediaUsageEvents).values({
    id: nanoid(),
    assetId: params.recommendation.assetId ?? null,
    topicId: params.topicId,
    sessionId: params.sessionId,
    classroomStudentId: params.classroomStudentId,
    selectionSource: params.recommendation.selectionSource,
    reason: params.recommendation.reason,
    expectedBenefit: params.recommendation.expectedBenefit,
    followUpPrompt: params.recommendation.followUpPrompt,
    relevanceScore: null,
    usefulnessScore: null,
    metadata: {
      title: params.recommendation.title,
      assetType: params.recommendation.assetType,
      durationSeconds: params.recommendation.durationSeconds,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
