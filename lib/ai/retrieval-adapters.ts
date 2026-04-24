import {
  retrievalAdapterRegistry,
  type RetrievalAdapter,
} from "@/lib/ai-core";

const learningRetrievalAdapter = retrievalAdapterRegistry.register({
  key: "learning.teacher_material",
  description:
    "Grounded retrieval for tutoring. Use when teacher-approved topic material should bound factual claims.",
  async retrieve(input) {
    const { findLearningEvidenceContext } = await import("@/lib/learning/evidence");
    const topicId =
      typeof input.metadata?.topicId === "string" ? input.metadata.topicId : null;

    if (!topicId) return [];

    return await findLearningEvidenceContext({
      topicId,
      query: input.query,
      language: (input.language as never) ?? "en",
      limit: input.limit ?? 6,
    });
  },
} satisfies RetrievalAdapter);

const surveyRetrievalAdapter = retrievalAdapterRegistry.register({
  key: "survey.rag",
  description:
    "Hybrid grounded retrieval for survey analytics and evidence lookups. Use when survey-indexed evidence should ground synthesis.",
  async retrieve(input) {
    const { executeRAGQuery } = await import("@/lib/rag/search");
    const surveyId =
      typeof input.metadata?.surveyId === "string" ? input.metadata.surveyId : null;

    if (!surveyId) return [];

    return await executeRAGQuery(
      input.query,
      {
        surveyId,
        limit: input.limit ?? 6,
        language: (input.language as never) ?? "en",
      },
      (input.language as never) ?? "en",
    );
  },
} satisfies RetrievalAdapter);

export { learningRetrievalAdapter, surveyRetrievalAdapter };
