import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { assertAudioUploadFile } from "@/lib/security/uploads";
import { transcribeAudioBuffer } from "@/lib/voice/analytics-stt";
import { normalizeSpeechToTextLanguage } from "@/lib/voice/voice-locales";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const formData = await request.formData();
    const audioFile = formData.get("audio");
    const language = normalizeSpeechToTextLanguage(formData.get("language"));

    if (!(audioFile instanceof File)) { return apiError("VALIDATION_ERROR", "Audio file is required"); }
    assertAudioUploadFile(audioFile);

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const transcript = await transcribeAudioBuffer(audioBuffer, language);

    return NextResponse.json(transcript);
  } catch (error) { if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) { return apiError("UNAUTHENTICATED", error.message); } return apiUnhandledError(error, "Failed to transcribe audio", "/api/surveys/[surveyId]/analytics/transcribe:post"); }
}

