import { NextRequest } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import type { ChatSessionMessage } from "@/shared/db/schema/surveys";
import { getVerifiedSession } from "@/features/auth/public-server";
import { askAnalyticsQuestion } from "@/features/surveys/server/education/analytics-workflow";
import { normalizeSpeechToTextLanguage } from "@/features/surveys/voice/voice-locales";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { z } from "zod";
import { getMessageText } from "@/shared/chat/chat-message-text";

export const maxDuration = 300;


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
          await import("@/features/surveys/voice/speech-to-text-provider");
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
    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const latestUserMessage = [...rawMessages]
      .reverse()
      .find((message) => message.role === "user");

    const question = getMessageText(latestUserMessage);

    if (!question.trim()) { if (sttError) { return apiError("VALIDATION_ERROR", sttError); } return apiError("VALIDATION_ERROR", "No question to process"); }

    const answer = await askAnalyticsQuestion({
      surveyId,
      question,
    });
    
    if (!answer) { return apiError("INTERNAL_ERROR", "Failed to generate answer"); }
    
    const responseText = answer.sources?.length
      ? `${answer.response}\n\nSources:\n${answer.sources.map((source: { label: string; id: string }) => `- ${source.label} (${source.id})`).join("\n")}`
      : answer.response;

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          const messageId = crypto.randomUUID();
          writer.write({
            id: messageId,
            type: "text-start",
          });
          writer.write({
            id: messageId,
            type: "text-delta",
            delta: responseText || "",
          });
          writer.write({
            id: messageId,
            type: "text-end",
          });
        },
      }),
    });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/analytics/chat:post");
  }
}

