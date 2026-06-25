import { z } from "zod";
import {
  executeImageSearchPipeline,
  executeVideoSearchPipeline,
  type MediaToolFailure,
} from "@/features/tutoring/server/media-retrieval";
import {
  IMAGE_SEARCH_MAX_CALLS_PER_TURN,
  VIDEO_SEARCH_MAX_CALLS_PER_TURN,
} from "@/features/tutoring/server/tutor-capabilities";
import type { ExpertFrameworkCapabilityGuidance } from "@/features/tutoring/public-server";

const searchImageSchema = z.object({
  query: z
    .string()
    .describe("The retrieval query sent to image search."),
  image_type: z
    .enum(["diagram", "photograph", "illustration"])
    .describe("The requested image category."),
});

const searchVideoSchema = z.object({
  query: z
    .string()
    .describe("The retrieval query sent to video search."),
});

const administerQuizSchema = z.object({
  conceptKey: z
    .string()
    .describe("The stable concept identifier for the assessment."),
  questionText: z
    .string()
    .describe("The single quiz question to render."),
  acceptsImageUpload: z
    .boolean()
    .describe("Whether the quiz card should allow an image upload response."),
});

const gradeStudentWorkSchema = z.object({
  quizId: z
    .string()
    .describe("The exact quizId returned by the earlier administer_quiz call for this assessment."),
  conceptKey: z
    .string()
    .describe("The conceptKey originally used when the quiz was created."),
  studentAnswerSummary: z
    .string()
    .describe("A factual summary of the student's submitted answer or evidence."),
  score: z.number().min(0).max(100).describe("The numeric score out of 100 for the student's answer."),
  feedback: z.string().describe("The feedback text to render in the grade card."),
  masteryLevel: z.enum(["surface", "applied", "generative"]).describe("The assessed mastery level for this concept."),
});

export const finishSessionSchema = z.object({
  completionRationale: z
    .string()
    .trim()
    .min(1)
    .describe("Why the session is ready to end."),
  coveredOutcomes: z
    .array(z.string().trim().min(1))
    .min(1)
    .describe("The specific outcomes or concepts covered in this session."),
  evidenceSummary: z
    .string()
    .trim()
    .min(1)
    .describe("Concrete evidence supporting session completion."),
  nextStepNote: z
    .string()
    .trim()
    .min(1)
    .describe("The note to show the student after the session is finished."),
});

type SearchImageInput = z.infer<typeof searchImageSchema>;
type SearchVideoInput = z.infer<typeof searchVideoSchema>;
type AdministerQuizInput = z.infer<typeof administerQuizSchema>;
type GradeStudentWorkInput = z.infer<typeof gradeStudentWorkSchema>;
type FinishSessionInput = z.infer<typeof finishSessionSchema>;

type SearchImageOutput = Awaited<ReturnType<typeof executeImageSearchPipeline>>;
type SearchVideoOutput = Awaited<ReturnType<typeof executeVideoSearchPipeline>>;
type AdministerQuizOutput = AdministerQuizInput & {
  quizId: string;
};
type GradeStudentWorkFailure = {
  success: false;
  errorCode: "missing_quiz_context";
  reason: string;
  quizId: string;
  conceptKey: string;
};
type GradeStudentWorkSuccess = GradeStudentWorkInput & {
  success: true;
  gradeId: string;
  gradedAt: string;
};
type GradeStudentWorkOutput =
  | GradeStudentWorkFailure
  | GradeStudentWorkSuccess;
type FinishSessionOutput = FinishSessionInput & {
  success: true;
  finishedAt: string;
};

type TutorTool<TInput, TOutput> = {
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (args: TInput) => Promise<TOutput>;
};

type TutorToolRegistry = Partial<{
  search_image: TutorTool<SearchImageInput, SearchImageOutput>;
  search_video: TutorTool<SearchVideoInput, SearchVideoOutput>;
  administer_quiz: TutorTool<AdministerQuizInput, AdministerQuizOutput>;
  grade_student_work: TutorTool<GradeStudentWorkInput, GradeStudentWorkOutput>;
}> & {
  finish_session: TutorTool<FinishSessionInput, FinishSessionOutput>;
};

function createDuplicateMediaFailure(input: {
  mediaType: "image" | "video";
  query: string;
  maxCalls: number;
}): MediaToolFailure {
  return {
    success: false,
    mediaType: input.mediaType,
    errorCode: "duplicate_call_blocked",
    reason: `Only ${input.maxCalls} ${input.mediaType} ${input.maxCalls === 1 ? "search is" : "searches are"} allowed in a single tutoring response.`,
    retryHint: "Use the most helpful media already found or continue without more media.",
    suggestedAction: "Do not call this tool again in the same response once the limit is reached.",
    query: input.query,
  };
}

function buildFrameworkToolDescription(input: {
  policy: string;
  systemBehavior: string;
}) {
  return [
    `Framework policy (authoritative for when and why to use this tool): ${input.policy}`,
    `System behavior: ${input.systemBehavior}`,
  ].join("\n\n");
}

export function createTutorTools(params: {
  topicTitle: string;
  studentContext: string;
  capabilityGuidance: ExpertFrameworkCapabilityGuidance;
  priorQuizIds?: string[];
}): TutorToolRegistry {
  let imageSearchCalls = 0;
  let videoSearchCalls = 0;
  const priorQuizIds = new Set(params.priorQuizIds ?? []);
  const maxImageSearchCalls = Math.min(
    params.capabilityGuidance.search_image.maxUsesPerTurn,
    IMAGE_SEARCH_MAX_CALLS_PER_TURN,
  );
  const maxVideoSearchCalls = Math.min(
    params.capabilityGuidance.search_video.maxUsesPerTurn,
    VIDEO_SEARCH_MAX_CALLS_PER_TURN,
  );

  const tools: Partial<TutorToolRegistry> = {};

  if (params.capabilityGuidance.search_image.enabled) {
    tools.search_image = {
      description: buildFrameworkToolDescription({
        policy: params.capabilityGuidance.search_image.policy,
        systemBehavior: `Retrieves one image result using the provided query and image_type. Returns a structured success or failure payload. Hard limit: ${maxImageSearchCalls} image ${maxImageSearchCalls === 1 ? "search" : "searches"} per tutoring response.`,
      }),
      inputSchema: searchImageSchema,
      execute: async ({ query, image_type }: SearchImageInput) => {
        if (imageSearchCalls >= maxImageSearchCalls) {
          return createDuplicateMediaFailure({
            mediaType: "image",
            query,
            maxCalls: maxImageSearchCalls,
          });
        }

        imageSearchCalls += 1;
        return await executeImageSearchPipeline(query, image_type, params.topicTitle, params.studentContext);
      },
    };
  }

  if (params.capabilityGuidance.search_video.enabled) {
    tools.search_video = {
      description: buildFrameworkToolDescription({
        policy: params.capabilityGuidance.search_video.policy,
        systemBehavior: `Retrieves one video result using the provided query. Returns a structured success or failure payload. Hard limit: ${maxVideoSearchCalls} video ${maxVideoSearchCalls === 1 ? "search" : "searches"} per tutoring response.`,
      }),
      inputSchema: searchVideoSchema,
      execute: async ({ query }: SearchVideoInput) => {
        if (videoSearchCalls >= maxVideoSearchCalls) {
          return createDuplicateMediaFailure({
            mediaType: "video",
            query,
            maxCalls: maxVideoSearchCalls,
          });
        }

        videoSearchCalls += 1;
        return await executeVideoSearchPipeline(query, params.topicTitle, params.studentContext);
      },
    };
  }

  if (params.capabilityGuidance.administer_quiz.enabled) {
    tools.administer_quiz = {
      description: buildFrameworkToolDescription({
        policy: params.capabilityGuidance.administer_quiz.policy,
        systemBehavior: "Renders one quiz card and returns a generated quizId that must be reused for later grading.",
      }),
      inputSchema: administerQuizSchema,
      execute: (args: AdministerQuizInput) => {
        // Generative UI tool: the returned quizId becomes the stable grading reference.
        return Promise.resolve({
          quizId: crypto.randomUUID(),
          ...args,
        });
      },
    };
  }

  if (params.capabilityGuidance.grade_student_work.enabled) {
    tools.grade_student_work = {
      description: buildFrameworkToolDescription({
        policy: params.capabilityGuidance.grade_student_work.policy,
        systemBehavior: "Renders one structured grade card. Validation requires the exact quizId from a prior administer_quiz result in the same session context.",
      }),
      inputSchema: gradeStudentWorkSchema,
      execute: (args: GradeStudentWorkInput) => {
        if (priorQuizIds.size === 0 || !priorQuizIds.has(args.quizId)) {
          return Promise.resolve({
            success: false,
            errorCode: "missing_quiz_context",
            reason:
              "grade_student_work requires a prior administer_quiz result with the same quizId.",
            quizId: args.quizId,
            conceptKey: args.conceptKey,
          });
        }

        // Generative UI tool: this stays structured so tutoring state can persist the exact assessment.
        return Promise.resolve({
          success: true,
          gradeId: crypto.randomUUID(),
          gradedAt: new Date().toISOString(),
          ...args,
        });
      },
    };
  }

  return {
    ...tools,
    finish_session: {
      description: buildFrameworkToolDescription({
        policy: params.capabilityGuidance.finish_session.policy,
        systemBehavior: "Marks the tutoring session complete when the required structured completion fields are supplied. Returns a timestamped success payload.",
      }),
      inputSchema: finishSessionSchema,
      execute: (args: FinishSessionInput) =>
        Promise.resolve({
          success: true,
          finishedAt: new Date().toISOString(),
          ...args,
        }),
    },
  };
}
