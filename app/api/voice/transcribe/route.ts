import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";

import { getVerifiedSession } from "@/features/auth/public-server";
import { assertAudioUploadFile } from "@/shared/security/uploads";
import { transcribeAudioBuffer } from "@/features/surveys/voice/speech-to-text-provider";
import { normalizeSpeechToTextLanguage } from "@/features/surveys/voice/voice-locales";

export async function POST(request: NextRequest) {
  try {
    await getVerifiedSession();

    const formData = await request.formData();
    const audioFile = formData.get("audio");
    const languageValue = formData.get("language");
    const language = normalizeSpeechToTextLanguage(languageValue);

    if (!(audioFile instanceof File)) {
      return apiError("VALIDATION_ERROR", "Audio file is required");
    }
    assertAudioUploadFile(audioFile);

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const transcript = await transcribeAudioBuffer(audioBuffer, language);

    return NextResponse.json(transcript);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return apiError("UNAUTHENTICATED", error.message);
    }

    return apiUnhandledError(error, "Failed to transcribe audio", "/api/voice/transcribe");
  }
}

