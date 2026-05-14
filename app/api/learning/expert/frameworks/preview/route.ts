import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { z } from "zod";

import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { getExpertAccessibleTopic } from "@/lib/learning/expert-access";
import { searchLearningTopicContext } from "@/lib/learning/rag";
import { previewAssessmentQuestionForTopic } from "@/lib/learning/session-engine";

const previewSchema = z.object({
  topicId: z.string().min(1),
  questionType: z.string().optional(),
  difficulty: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const body = previewSchema.parse(await request.json());
    const topic = await getExpertAccessibleTopic(body.topicId);
    if (!topic) {
      return apiError("NOT_FOUND", "Topic not found");
    }

    const retrieved = await searchLearningTopicContext({
      topicId: topic.id,
      query: `${topic.title} conceptual depth question`,
      contentLocale: topic.contentLocale,
      limit: 4,
    });

    const question = await previewAssessmentQuestionForTopic({
      topicTitle: topic.title,
      retrievedContext: retrieved.map((item) => item.content),
      runtimeContext: {
        studyLanguage: topic.contentLocale,
        topicId: topic.id,
      },
      currentStageLabel: "Probe",
      questionType: body.questionType,
      difficulty: body.difficulty,
    });

    return NextResponse.json({
      success: true,
      data: {
        question,
        guidanceCount: 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }

    return handleLearningRouteError(
      error,
      "Failed to preview question",
      "expert-frameworks-preview:post",
    );
  }
}
