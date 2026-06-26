import type { LessonSourceBoundary } from "@/features/tutoring/public-server";
import { contentScopeSnapshotSchema, type ContentScopeSnapshot } from "@/features/tutoring/public-server";
import { buildContentScopeFromPack } from "@/features/tutoring/server/lesson-grounding-pack-service";
import { getCachedLessonWithMaterials } from "@/features/tutoring/public-server";
import { TUTORING_STATUS } from "@/shared/tutoring/constants";

export class ContentScopeService {
  /**
   * Builds session grounding from the compiled lesson pack (no per-turn embedding search).
   */
  async buildScopeFromPack(params: {
    lessonId: string;
    sourceBoundary: LessonSourceBoundary;
    contentLocale?: string | null;
  }): Promise<ContentScopeSnapshot> {
    const lesson = await getCachedLessonWithMaterials(params.lessonId);
    if (!lesson) {
      throw new Error("Lesson not found.");
    }

    const materialIds = lesson.materials
      .filter((material) => material.indexingStatus === TUTORING_STATUS.materialCompleted)
      .map((material) => material.id);

    const snapshot = buildContentScopeFromPack({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      contentLocale: params.contentLocale ?? lesson.contentLocale,
      sourceBoundary: params.sourceBoundary,
      learningOutcomes: lesson.learningOutcomes ?? [],
      pack: lesson.lessonGroundingPack ?? null,
      materialIds,
    });

    return contentScopeSnapshotSchema.parse(snapshot);
  }
}

export const contentScopeService = new ContentScopeService();


