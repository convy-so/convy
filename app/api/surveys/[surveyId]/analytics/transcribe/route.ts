import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
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
    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio");
    const language = normalizeSpeechToTextLanguage(formData.get("language"));

    if (!(audioFile instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }
    assertAudioUploadFile(audioFile);

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const transcript = await transcribeAudioBuffer(audioBuffer, language);

    return NextResponse.json(transcript);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[Analytics Transcribe API] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to transcribe audio",
      },
      { status: 500 },
    );
  }
}
