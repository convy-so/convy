import { z } from "zod";
import { searchLearningTopicContext } from "@/lib/learning/rag";

export function createTutorTools(params: {
  topicId: string;
  contentLocale: string;
}) {
  return {
    search_course_materials: {
      description: "Search the course materials for a specific topic, concept, or formula. Use this to find accurate facts, teacher definitions, and notation from the uploaded course content. You should use this tool whenever you are unsure about a specific concept or need to provide a grounded explanation.",
      inputSchema: z.object({
        query: z.string().describe("The search query to look up in the materials."),
      }),
      execute: async ({ query }: { query: string }) => {
        const results = await searchLearningTopicContext({
          topicId: params.topicId,
          query,
          contentLocale: params.contentLocale,
          limit: 8,
        });

        if (results.length === 0) {
          return {
            success: true,
            content: "No specific results found in the course materials for this query. Try a broader search or rely on the general topic boundaries provided in your instructions.",
          };
        }

        return {
          success: true,
          results: results.map((r) => ({
            content: r.content,
            materialId: r.sourceId,
          })),
        };
      },
    },
  };
}
