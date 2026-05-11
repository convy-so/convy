import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/dal";
import { listSurveysForUser, createSurveyForUser } from "@/lib/surveys/surveys-route-service";
import { createSurveySchema } from "@/lib/validation/survey-schemas";
import { SURVEY_LIMITS } from "@/lib/config";
import { mapSessionAuthError } from "@/lib/route-auth-error";

export async function GET() {
  try {
    const session = await getVerifiedSession();

    const surveys = await listSurveysForUser(session.user.id);
    return NextResponse.json({ surveys });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "/api/surveys:get");
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return apiError("VALIDATION_ERROR", "Invalid request body");
    }

    const validationResult = createSurveySchema.safeParse(rawBody);
    if (!validationResult.success) {
      return apiError("VALIDATION_ERROR", "Validation failed", {
        details: { message: validationResult.error.errors[0]?.message },
      });
    }

    const body = validationResult.data;
    const deliveryMode = body.deliveryMode;
    const classroomId = body.classroomId;
    if (deliveryMode === "classroom_assigned" && !classroomId) {
      return apiError(
        "VALIDATION_ERROR",
        "Class-linked surveys must target a classroom.",
      );
    }

    const { createdSurvey, greeting, existingSurveys } = await createSurveyForUser({
      session,
      body,
    });

    const isVoice = body.isVoice;
    if (existingSurveys.length >= SURVEY_LIMITS.MAX_SURVEYS_PER_SCOPE) {
      return apiError(
        "UNAUTHORIZED",
        `Limit reached: You can only have ${SURVEY_LIMITS.MAX_SURVEYS_PER_SCOPE} surveys in your account`,
      );
    }
    if (
      isVoice &&
      existingSurveys.filter((item) => item.isVoice).length >=
        SURVEY_LIMITS.MAX_VOICE_SURVEYS_PER_SCOPE
    ) {
      return apiError(
        "UNAUTHORIZED",
        `Limit reached: You can only have ${SURVEY_LIMITS.MAX_VOICE_SURVEYS_PER_SCOPE} voice surveys in your account`,
      );
    }

    return NextResponse.json({
      ...createdSurvey,
      messages: [
        {
          id: nanoid(),
          role: "assistant",
          content: greeting,
          parts: [{ type: "text", text: greeting }],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", {
        details: { message: error.errors[0]?.message },
      });
    }

    const authError = mapSessionAuthError(error);
    if (authError) return authError;

    return apiUnhandledError(error, "Internal server error", "/api/surveys:post");
  }
}
