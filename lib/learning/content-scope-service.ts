import type { TopicSourceBoundary } from "@/lib/learning/types";
import { contentScopeSnapshotSchema, type ContentScopeSnapshot } from "@/lib/learning/types";
import { buildContentScopeFromPack } from "@/lib/learning/topic-grounding-pack-service";
import { getTopicWithMaterials } from "@/lib/learning/storage";

export class ContentScopeService {
  /**
   * Builds session grounding from the compiled topic pack (no per-turn embedding search).
   */
  async buildScopeFromPack(params: {
    topicId: string;
    sourceBoundary: TopicSourceBoundary;
    contentLocale?: string | null;
  }): Promise<ContentScopeSnapshot> {
    const topic = await getTopicWithMaterials(params.topicId);
    if (!topic) {
      throw new Error("Topic not found.");
    }

    const materialIds = topic.materials
      .filter((material) => material.indexingStatus === "completed")
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
