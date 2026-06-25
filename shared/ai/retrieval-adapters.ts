import {
  retrievalAdapterRegistry,
  type RetrievalAdapter,
} from "@/shared/ai/core";

const surveyRetrievalAdapter = retrievalAdapterRegistry.register({
  key: "survey.rag",
  description:
    "Hybrid grounded retrieval for survey analytics and evidence lookups. Use when survey-indexed evidence should ground synthesis.",
  async retrieve(input) {
    const { executeRAGQuery } = await import("@/shared/retrieval/search");
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

export { surveyRetrievalAdapter };
