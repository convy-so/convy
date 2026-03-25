import { and, eq } from "drizzle-orm";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getClientIP, apiRateLimiter } from "@/lib/ratelimit";
import { generateAIResponse } from "@/lib/ai";
import {
  buildConductingSystemPrompt,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  purgeSessionAnalyticsArtifacts,
  getResearchBrief,
  getSessionBySourceId,
} from "@/lib/education/storage";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  publishPendingOutboxEntries,
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export const maxDuration = 300;
const MAX_SAMPLE_CONVERSATIONS = 3;

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

function normalizeMessages(messages: any[]): ChatMessage[] {
  return messages
    .map((message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : Array.isArray(message.parts)
            ? message.parts
                .filter((part: any) => part.type === "text")
                .map((part: any) => part.text)
                .join("")
            : "";
      return {
        id: message.id,
        role: message.role,
        content,
        timestamp: message.timestamp || new Date().toISOString(),
      } as ChatMessage;
    })
    .filter((message) => message.role === "user" || message.role === "assistant");
}

async function ensureRehearsalLease(input: {
  surveyId: string;
  userId: string;
  sessionId?: string | null;
  leaseToken?: string | null;
  force?: boolean;
}) {
  const activeLease = await getActiveSurveyLease(input.surveyId, "rehearsal");

  if (
    activeLease &&
    activeLease.holderUserId !== input.userId &&
    (!input.leaseToken || input.leaseToken !== activeLease.leaseToken)
  ) {
    return { ok: false as const, error: "LEASE_CONFLICT", lease: activeLease };
  }

  if (
    activeLease &&
    activeLease.holderUserId === input.userId &&
    input.leaseToken === activeLease.leaseToken
  ) {
    return { ok: true as const, lease: activeLease };
  }

  return await acquireSurveyLease({
    surveyId: input.surveyId,
    stage: "rehearsal",
    userId: input.userId,
    sessionId: input.sessionId,
    force: input.force,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const conversationNumber = Number(searchParams.get("conversationNumber") || 1);

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(session.user.id, survey.id);
    if (!permission?.canView) return new Response("Unauthorized", { status: 403 });

    const [sample] = await getDb()
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      )
      .limit(1);

    return NextResponse.json({
      messages: sample?.messages || [],
      lease: await getActiveSurveyLease(surveyId, "rehearsal"),
      revision: await getCurrentSurveyRevision(surveyId),
    });
  } catch (error) {
    console.error("[Sample GET] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = await apiRateLimiter.limit(clientIP);
    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: rateLimitResult.reset,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const conversationNumber = Number(body.conversationNumber || 1);
    const messages = normalizeMessages(Array.isArray(body.messages) ? body.messages : []);

    if (conversationNumber < 1 || conversationNumber > MAX_SAMPLE_CONVERSATIONS) {
      return new Response(
        `Invalid conversation number. Must be between 1 and ${MAX_SAMPLE_CONVERSATIONS}`,
        { status: 400 },
      );
    }

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(session.user.id, survey.id);
    if (!permission?.canEdit) {
      return new Response("Unauthorized: Editor access required", { status: 403 });
    }
    if (survey.status !== "draft" && survey.status !== "sample_review") {
      return new Response(
        "Survey must be in draft or sample_review status for sample conversations",
        { status: 400 },
      );
    }

    const currentRevision = await getCurrentSurveyRevision(surveyId);
    if (
      typeof body.expectedRevision === "number" &&
      body.expectedRevision !== currentRevision
    ) {
      return NextResponse.json(
        {
          error: "REVISION_CONFLICT",
          currentRevision,
        },
        { status: 409 },
      );
    }

    const leaseResult = await ensureRehearsalLease({
      surveyId,
      userId: session.user.id,
      sessionId:
        typeof body.sessionId === "string" ? body.sessionId : session.session.id,
      leaseToken: typeof body.leaseToken === "string" ? body.leaseToken : null,
      force: Boolean(body.forceLease),
    });

    if (!leaseResult.ok) {
      return NextResponse.json(
        {
          error: leaseResult.error,
          lease: "lease" in leaseResult ? leaseResult.lease : null,
        },
        { status: 409 },
      );
    }

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);
    if (!briefRow || !planRow) {
      return new Response(
        "This survey does not have an approved education brief yet.",
        { status: 400 },
      );
    }

    const [activeSampleProfile, runtimeLayers] = await Promise.all([
      getActiveConductingProfile(surveyId, "sample"),
      getConductingRuntimeLayers({
        surveyId,
        organizationId: survey.organizationId,
        mode: "sample",
      }),
    ]);

    let [sampleConversation] = await getDb()
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      )
      .limit(1);

    if (!sampleConversation) {
      const [created] = await getDb()
        .insert(sampleConversations)
        .values({
          id: `sample-${surveyId}-${conversationNumber}`,
          surveyId,
          conversationNumber,
          messages: [],
          confirmed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      sampleConversation = created;
      await getDb()
        .update(surveys)
        .set({
          sampleConversationCount: Math.max(
            survey.sampleConversationCount,
            conversationNumber,
          ),
          updatedAt: new Date(),
        })
        .where(eq(surveys.id, surveyId));
    }

    let sessionRow = await getSessionBySourceId(sampleConversation.id);
    if (!sessionRow) {
      sessionRow = await ensureSession({
        surveyId,
        sessionType: "sample",
        sourceConversationId: sampleConversation.id,
        language: survey.language,
        initialState: createInitialSessionState({
          surveyId,
          sessionId: nanoid(),
          sessionType: "sample",
          language: survey.language as any,
          coveragePlan: planRow.plan,
        }),
      });
    }

    const brief = briefRow.brief;
    const state = sessionRow.sessionState;
    const systemPrompt = buildConductingSystemPrompt({
      brief,
      coveragePlan: planRow.plan,
      sessionState: state,
      sessionType: "sample",
      conductingProfile: activeSampleProfile?.profile ?? null,
      playbookContext: runtimeLayers.playbookContext,
      personalityContext: runtimeLayers.personalityContext,
    });

    const visibleMessages =
      messages.length > 0
        ? messages
        : [
            {
              role: "user",
              content:
                "Start the sample interview by greeting the participant and asking the first best question.",
            } as ChatMessage,
          ];

    const responseText = await generateAIResponse(
      visibleMessages
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n\n"),
      systemPrompt,
      { surveyId, userId: session.user.id, maxTokens: 500, temperature: 0.4 },
    );

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    const persistedMessages =
      messages.length > 0 ? [...messages, assistantMessage] : [assistantMessage];

    await getDb().transaction(async (tx) => {
      await tx
        .update(sampleConversations)
        .set({
          messages: persistedMessages,
          updatedAt: new Date(),
        })
        .where(eq(sampleConversations.id, sampleConversation.id));

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.rehearsal_turn_added",
        actorId: session.user.id,
        payload: {
          surveyId,
          conversationNumber,
          sampleConversationId: sampleConversation.id,
          lease: leaseResult.lease,
          messages: persistedMessages.slice(-2),
        },
      });
    });

    if (visibleMessages.some((message) => message.role === "user")) {
      await finalizeConductingTurn({
        surveyId,
        sessionId: sessionRow.id,
        brief,
        coveragePlan: planRow.plan,
        sessionState: state,
        messages: persistedMessages,
      });
      await purgeSessionAnalyticsArtifacts({
        surveyId,
        sessionId: sessionRow.id,
      }).catch((error) => {
        console.error(
          "[Sample Route] Failed to purge rehearsal analytics artifacts:",
          error,
        );
      });
    }

    await publishPendingOutboxEntries();

    const remainingSamples = MAX_SAMPLE_CONVERSATIONS - conversationNumber;
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-delta", textDelta: responseText } as any);
        },
      }),
    });
    response.headers.set("X-Remaining-Samples", remainingSamples.toString());
    response.headers.set("X-Conversation-Number", conversationNumber.toString());
    response.headers.set("X-Survey-Revision", String(currentRevision + 1));
    response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
    return response;
  } catch (error) {
    console.error("[Sample Route] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
