import { z } from "zod";
import {
  executeImageSearchPipeline,
  executeVideoSearchPipeline,
  type MediaToolFailure,
} from "@/lib/learning/media-retrieval";

const searchImageSchema = z.object({
  query: z
    .string()
    .describe(
      "A search-optimized query that names the concept, the visual format, and useful qualifiers. Examples: 'mitosis stages labeled diagram cell biology', 'volcano cross-section annotated geology', 'frog anatomy labeled photograph'.",
    ),
  image_type: z
    .enum(["diagram", "photograph", "illustration"])
    .describe(
      "The visual category that best matches the teaching need. Use diagram for labeled structure/process views, photograph for real-world visuals, and illustration for simplified explanatory art.",
    ),
});

const searchVideoSchema = z.object({
  query: z
    .string()
    .describe(
      "A search-optimized query for an educational explainer video. Include the concept and the kind of explainer needed. Examples: 'how DNA replication works explained', 'photosynthesis animation explained', 'acid base titration experiment tutorial'.",
    ),
});

const administerQuizSchema = z.object({
  conceptKey: z
    .string()
    .describe("The core concept being tested. Keep it short and stable, for example 'fractions', 'mitosis', or 'forces'."),
  questionText: z
    .string()
    .describe("The exact quiz question to ask the student. Ask one question only."),
  acceptsImageUpload: z
    .boolean()
    .describe(
      "Set to true only if answering would genuinely benefit from a notebook, scratchpad, or diagram upload, such as math working or a drawn scientific structure.",
    ),
});

const gradeStudentWorkSchema = z.object({
  quizId: z
    .string()
    .describe("The exact quizId returned by the earlier administer_quiz call for this assessment."),
  conceptKey: z
    .string()
    .describe("The same conceptKey used when the quiz was created."),
  studentAnswerSummary: z
    .string()
    .describe(
      "A short factual summary of the student's answer, mistake pattern, or evidence shown in the upload. Keep it grounded in what the student actually submitted.",
    ),
  score: z.number().min(0).max(100).describe("The numeric score out of 100 for the student's answer."),
  feedback: z.string().describe("Constructive, encouraging feedback explaining what they did right and where they can improve."),
  masteryLevel: z.enum(["surface", "applied", "generative"]).describe("The newly assessed mastery level for this concept based on their answer."),
});

type SearchImageInput = z.infer<typeof searchImageSchema>;
type SearchVideoInput = z.infer<typeof searchVideoSchema>;
type AdministerQuizInput = z.infer<typeof administerQuizSchema>;
type GradeStudentWorkInput = z.infer<typeof gradeStudentWorkSchema>;

function createDuplicateMediaFailure(input: {
  mediaType: "image" | "video";
  query: string;
}): MediaToolFailure {
  return {
    success: false,
    mediaType: input.mediaType,
    errorCode: "duplicate_call_blocked",
    reason: `Only one ${input.mediaType} search is allowed in a single tutoring response.`,
    retryHint: "Use the best media already found or continue without another media search.",
    suggestedAction: "Do not call this tool again in the same response.",
    query: input.query,
  };
}

export function createTutorTools(params: {
  topicTitle: string;
  studentContext: string;
}) {
  let imageSearchCalls = 0;
  let videoSearchCalls = 0;

  return {
    search_image: {
      description:
        "Search for a single educational image to show the student. Use only when the concept has a meaningful visual form such as anatomy, labeled diagrams, physical structures, processes, geography, or chemistry. Avoid this for abstract or purely logical concepts. You may call this at most once in a single tutoring response. Preferred query pattern: '<concept> labeled diagram', '<concept> cross-section', or '<concept> annotated photo'.",
      inputSchema: searchImageSchema,
      execute: async ({ query, image_type }: SearchImageInput) => {
        if (imageSearchCalls >= 1) {
          return createDuplicateMediaFailure({ mediaType: "image", query });
        }

        imageSearchCalls += 1;
        return await executeImageSearchPipeline(query, image_type, params.topicTitle, params.studentContext);
      },
    },
    search_video: {
      description:
        "Search for a single educational video to show the student. Use when explaining a multi-step process, dynamic system, experiment, or any concept where motion and sequence matter more than a static visual. You may call this at most once in a single tutoring response. Preferred query pattern: '<concept> explained', '<concept> animation', or '<concept> experiment'.",
      inputSchema: searchVideoSchema,
      execute: async ({ query }: SearchVideoInput) => {
        if (videoSearchCalls >= 1) {
          return createDuplicateMediaFailure({ mediaType: "video", query });
        }

        videoSearchCalls += 1;
        return await executeVideoSearchPipeline(query, params.topicTitle, params.studentContext);
      },
    },
    administer_quiz: {
      description:
        "Ask the student one focused quiz question and render an interactive Quiz UI card in the chat. Use this when you want to formally assess understanding of a specific concept. The returned quizId becomes the stable identifier for later grading.",
      inputSchema: administerQuizSchema,
      execute: async (args: AdministerQuizInput) => {
        // Generative UI tool: the returned quizId becomes the stable grading reference.
        return {
          quizId: crypto.randomUUID(),
          ...args
        };
      },
    },
    grade_student_work: {
      description:
        "Grade the student's answer to a previously administered quiz and render a structured Grade UI card in the chat. Use this immediately after receiving the student's answer. Always pass the exact quizId returned by administer_quiz and the same conceptKey so the grade is tied to the correct assessment.",
      inputSchema: gradeStudentWorkSchema,
      execute: async (args: GradeStudentWorkInput) => {
        // Generative UI tool: this stays structured so tutoring state can persist the exact assessment.
        return {
          gradeId: crypto.randomUUID(),
          gradedAt: new Date().toISOString(),
          ...args
        };
      },
    }
  };
}
