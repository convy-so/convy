import { NextRequest, NextResponse } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { answerAnalyticsQuestion } from "@/lib/education/analytics-workflow";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = (await request.json()) as {
      messages?: Array<{ role: string; content?: string; parts?: any[] }>;
      audio?: string;
      language?: string;
    };

    let rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (body.audio) {
      try {
        const { transcribeAudioBuffer } = await import("@/lib/voice/analytics-stt");
        const audioBuffer = Buffer.from(body.audio, "base64");
        const transcript = await transcribeAudioBuffer(audioBuffer, body.language || "en");
        rawMessages = [...rawMessages, { role: "user", content: transcript }];
      } catch (error) {
        console.error("[Analytics Chat] STT failed:", error);
      }
    }

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

    const permission = await getSurveyPermissionContext(session.user.id, survey.id, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canView || !permission.activeContextMatchesResource) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const latestUserMessage = [...rawMessages]
      .reverse()
      .find((message) => message.role === "user");
    const question = typeof latestUserMessage?.content === "string"
      ? latestUserMessage.content
      : Array.isArray(latestUserMessage?.parts)
        ? latestUserMessage.parts.filter((part: any) => part.type === "text").map((part: any) => part.text).join("")
        : "";
    if (!question.trim()) {
      return NextResponse.json({ error: "No question to process" }, { status: 400 });
    }

    const answer = await answerAnalyticsQuestion({ surveyId, question });
    const responseText = answer.sources?.length
      ? `${answer.response}\n\nSources:\n${answer.sources.map((source) => `- ${source.label} (${source.id})`).join("\n")}`
      : answer.response;

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-delta", textDelta: responseText } as any);
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Analytics Chat API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
