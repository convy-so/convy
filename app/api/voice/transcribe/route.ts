import { NextRequest, NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { assertAudioUploadFile } from "@/lib/security/uploads";
import { transcribeAudioBuffer } from "@/lib/voice/speech-to-text-provider";
import { normalizeSpeechToTextLanguage } from "@/lib/voice/voice-locales";

export async function POST(request: NextRequest) {
  try {
    await getVerifiedSession();

    const formData = await request.formData();
    const audioFile = formData.get("audio");
    const languageValue = formData.get("language");
    const language = normalizeSpeechToTextLanguage(languageValue);

    if (!(audioFile instanceof File)) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 },
      );
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
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

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

