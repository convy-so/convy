import type { TopicSourceBoundary } from "@/features/tutoring/public-server";
import { contentScopeSnapshotSchema, type ContentScopeSnapshot } from "@/features/tutoring/public-server";
import { buildContentScopeFromPack } from "@/features/tutoring/server/lesson-grounding-pack-service";
import { getCachedTopicWithMaterials } from "@/features/tutoring/public-server";
import { LEARNING_STATUS } from "@/shared/learning/constants";

export class ContentScopeService {
  /**
   * Builds session grounding from the compiled topic pack (no per-turn embedding search).
   */
  async buildScopeFromPack(params: {
    topicId: string;
    sourceBoundary: TopicSourceBoundary;
    contentLocale?: string | null;
  }): Promise<ContentScopeSnapshot> {
    const topic = await getCachedTopicWithMaterials(params.topicId);
    if (!topic) {
      throw new Error("Topic not found.");
    }

    const materialIds = topic.materials
      .filter((material) => material.indexingStatus === LEARNING_STATUS.materialCompleted)
      .map((material) => material.id);

    const snapshot = buildContentScopeFromPack({
      topicId: topic.id,
      topicTitle: topic.title,
      contentLocale: params.contentLocale ?? topic.contentLocale,
      sourceBoundary: params.sourceBoundary,
      learningOutcomes: topic.learningOutcomes ?? [],
      pack: topic.topicGroundingPack ?? null,
      materialIds,
    });

    return contentScopeSnapshotSchema.parse(snapshot);
  }
}

export const contentScopeService = new ContentScopeService();
