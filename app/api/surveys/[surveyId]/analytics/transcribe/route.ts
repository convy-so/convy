import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { assertAudioUploadFile } from "@/shared/security/uploads";
import { transcribeAudioBuffer } from "@/features/surveys/voice/speech-to-text-provider";
import { normalizeSpeechToTextLanguage } from "@/features/surveys/voice/voice-locales";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";

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
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Failed to transcribe audio", "/api/surveys/[surveyId]/analytics/transcribe:post");
  }
}

