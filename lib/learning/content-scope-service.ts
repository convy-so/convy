import type { TopicSourceBoundary } from "@/lib/learning/types";
import { contentScopeSnapshotSchema, type ContentScopeSnapshot } from "@/lib/learning/types";
import { searchLearningTopicContext } from "@/lib/learning/rag";
import { getTopicWithMaterials } from "@/lib/learning/storage";

export class ContentScopeService {
  async buildScope(params: {
    topicId: string;
    sourceBoundary: TopicSourceBoundary;
    query: string;
    contentLocale?: string | null;
  }): Promise<ContentScopeSnapshot> {
    const topic = await getTopicWithMaterials(params.topicId);
    if (!topic) {
      throw new Error("Topic not found.");
    }

    const retrieved = await searchLearningTopicContext({
      topicId: params.topicId,
      query: params.query,
      contentLocale: params.contentLocale ?? topic.contentLocale,
      limit: 6,
    }).catch(() => []);

    return contentScopeSnapshotSchema.parse({
      topicId: topic.id,
      topicTitle: topic.title,
      contentLocale: params.contentLocale ?? topic.contentLocale,
      teacherSummary: params.sourceBoundary.teacherSummary,
      materialIds:
        params.sourceBoundary.allowedMaterialIds.length > 0
          ? params.sourceBoundary.allowedMaterialIds
          : topic.materials.map((material) => material.id),
      scopeNotes: params.sourceBoundary.scopeNotes,
      notationNotes: params.sourceBoundary.notationNotes,
      rigorNotes: params.sourceBoundary.rigorNotes,
      retrievedContext: retrieved.map((item) => item.content),
      learningOutcomes: topic.learningOutcomes || [],
    });
  }
}

export const contentScopeService = new ContentScopeService();
