import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/session";
import { isExpert } from "@/lib/auth/roles";
import { getTeacherOwnedTopic } from "@/lib/learning/expert-access";
import { searchLearningTopicContext } from "@/lib/learning/rag";
import { previewAssessmentQuestionForTopic } from "@/lib/learning/session-engine";

const previewSchema = z.object({
  topicId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    if (!isExpert(session.user)) {
      throw new Error("Unauthorized: Expert or admin access required");
    }

    const body = previewSchema.parse(await request.json());
    const topic = await getTeacherOwnedTopic(session.user.id, body.topicId);
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

    return apiUnhandledError(error, "Failed to preview question", "expert-assets-preview:post");
  }
}
