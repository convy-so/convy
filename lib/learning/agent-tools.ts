import { z } from "zod";
import { searchLearningTopicContext } from "@/lib/learning/rag";
import { executeImageSearchPipeline, executeVideoSearchPipeline } from "@/lib/learning/media-retrieval";
import type { CompiledFrameworkPolicy } from "@/lib/learning/types";

export function createTutorTools(params: {
  topicId: string;
  contentLocale: string;
  topicTitle: string;
  studentContext: string;
  compiledPolicy?: CompiledFrameworkPolicy | null;
}) {
  const tools: any = {
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
    search_image: {
      description: "Search for an educational image to show the student. Use when introducing a concept that has a meaningful visual form: anatomy, physical structures, diagrams, processes, geography, chemistry, and so on. Do not use for abstract or purely logical concepts. Do not use more than once per response.",
      inputSchema: z.object({
        query: z.string().describe("A search-optimized query. Include the concept name, the type of visual needed (diagram, cross-section, photograph, etc.), and any useful qualifiers. Example: 'mitosis stages labeled diagram cell biology'"),
        image_type: z.enum(["diagram", "photograph", "illustration"]).describe("The most helpful type of image for this concept.")
      }),
      execute: async ({ query, image_type }: { query: string; image_type: string }) => {
        return await executeImageSearchPipeline(query, image_type, params.topicTitle, params.studentContext);
      }
    },
    search_video: {
      description: "Search for an educational video to show the student. Use when explaining a multi-step process, dynamic system, experiment, or anything where seeing motion and sequence aids understanding more than a static image would. Do not use more than once per response.",
      inputSchema: z.object({
        query: z.string().describe("A search-optimized query for finding an educational explainer video. Include the concept name and context. Example: 'how DNA replication works explained'")
      }),
      execute: async ({ query }: { query: string }) => {
        return await executeVideoSearchPipeline(query, params.topicTitle, params.studentContext);
      }
    },
    administer_quiz: {
      description: "Ask the student a quiz question and render a dedicated interactive Quiz UI card in the chat. Use this when you want to formally assess their understanding of a concept.",
      inputSchema: z.object({
        conceptKey: z.string().describe("The core concept being tested."),
        questionText: z.string().describe("The actual quiz question to ask the student."),
        acceptsImageUpload: z.boolean().describe("Set to true if answering this question would benefit from the student uploading a picture of their notebook, scratchpad, or a drawn diagram (e.g. for math problems, chemical structures).")
      }),
      execute: async (args: any) => {
        // Generative UI tool: The client will render the QuizCard when it sees this tool call.
        // We just return the args so the UI knows what to render.
        return {
          quizId: crypto.randomUUID(),
          ...args
        };
      }
    },
    grade_student_work: {
      description: "Grade the student's answer to a quiz (whether text or uploaded image) and render a beautiful Grade UI card in the chat. Use this immediately after receiving the student's answer to your quiz.",
      inputSchema: z.object({
        score: z.number().min(0).max(100).describe("The numeric score out of 100 for the student's answer."),
        feedback: z.string().describe("Constructive, encouraging feedback explaining what they did right and where they can improve."),
        masteryLevel: z.enum(["surface", "applied", "generative"]).describe("The newly assessed mastery level for this concept based on their answer.")
      }),
      execute: async (args: any) => {
        // Generative UI tool: The client will render the GradeCard when it sees this tool call.
        return {
          gradeId: crypto.randomUUID(),
          ...args
        };
      }
    }
  };

  if (params.compiledPolicy?.toolPolicy.images === "forbidden") {
    delete tools.search_image;
  }

  if (params.compiledPolicy?.toolPolicy.videos === "forbidden") {
    delete tools.search_video;
  }

  if (params.compiledPolicy?.toolPolicy.structuredQuiz === "forbidden") {
    delete tools.administer_quiz;
  }

  if (params.compiledPolicy?.toolPolicy.formalGrading === "forbidden") {
    delete tools.grade_student_work;
  }

  return tools;
}
