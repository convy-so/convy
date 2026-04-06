import { NextRequest, NextResponse } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import type { ChatSessionMessage } from "@/db/schema/surveys";
import { getVerifiedSession } from "@/lib/auth/session";
import { answerAnalyticsQuestion } from "@/lib/education/analytics-workflow";
import { normalizeSpeechToTextLanguage } from "@/lib/voice/voice-locales";
import { getUserPreferredLanguage } from "@/lib/translation-service";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import { z } from "zod";
import { normalizeAppLocale } from "@/lib/i18n/config";

export const maxDuration = 300;

type AnalyticsChatMessage = {
  role: string;
  content?: string;
  parts?: ChatSessionMessage["parts"];
};

const analyticsChatMessageSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
  parts: z
    .custom<ChatSessionMessage["parts"]>((value) => Array.isArray(value))
    .optional(),
});

const analyticsChatRequestSchema = z.object({
  messages: z.array(analyticsChatMessageSchema).optional(),
  audio: z.string().optional(),
  language: z.string().optional(),
});

function getMessageText(
  message: Pick<AnalyticsChatMessage, "content" | "parts"> | undefined,
) {
  if (typeof message?.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message?.parts)) {
    return "";
  }

  return message.parts
    .filter(
      (
        part,
      ): part is Extract<
        ChatSessionMessage["parts"][number],
        { type: "text" }
      > => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = analyticsChatRequestSchema.parse(await request.json());

    let rawMessages = Array.isArray(body.messages) ? body.messages : [];
    let sttError: string | null = null;
    if (body.audio) {
      try {
        const { transcribeAudioBuffer } =
          await import("@/lib/voice/analytics-stt");
        const normalizedAudio = body.audio.includes(",")
          ? body.audio.split(",").pop() || ""
          : body.audio;
        const audioBuffer = Buffer.from(normalizedAudio, "base64");
        const { transcript } = await transcribeAudioBuffer(
          audioBuffer,
          normalizeSpeechToTextLanguage(body.language),
        );
        rawMessages = [...rawMessages, { role: "user", content: transcript }];
      } catch (error) {
        console.error("[Analytics Chat] STT failed:", error);
        sttError =
          error instanceof Error ? error.message : "Voice transcription failed";
      }
    }

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey)
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const latestUserMessage = [...rawMessages]
      .reverse()
      .find((message) => message.role === "user");

    const question = getMessageText(latestUserMessage);

    if (!question.trim()) {
      if (sttError) {
        return NextResponse.json({ error: sttError }, { status: 422 });
      }
      return NextResponse.json(
        { error: "No question to process" },
        { status: 400 },
      );
    }

    const responseLanguage = normalizeAppLocale(
      body.language ??
        (await getUserPreferredLanguage(session.user.id).catch(() => "en")),
    );
    const answer = await answerAnalyticsQuestion({
      surveyId,
      question,
      language: responseLanguage,
    });
    const responseText = answer.sources?.length
      ? `${answer.response}\n\nSources:\n${answer.sources.map((source) => `- ${source.label} (${source.id})`).join("\n")}`
      : answer.response;

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({
            id: crypto.randomUUID(),
            type: "text-delta",
            delta: responseText || "",
          });
        },
      }),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Analytics Chat API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
