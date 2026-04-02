import { stepCountIs, tool } from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { z } from "zod";
import { surveyCreationConversations, surveys } from "@/db/schema";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import { toPersistedUIChatMessages, toUIMessages } from "@/lib/chat-ui-messages";
import { type ChatMessage, type ExtractedData } from "@/lib/chat-types";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import { getSurveyPermissionContext } from "@/lib/workspace-access";
import { getClientIP, apiRateLimiter } from "@/lib/ratelimit";
import {
  buildCreationSystemPrompt,
  type CreationAgentState,
} from "@/lib/education/creation-agent";
import {
  deriveCreationMediaDecision,
  getCreationFinishSurveyToolDefinition,
  getCreationRequestMediaUploadToolDefinition,
  isCreationMediaDecisionResolved,
} from "@/lib/education/agent-tools";
import {
  buildCreationCollectedInfo,
  buildCreationExtractedData,
} from "@/lib/education/creation-state";
import {
  persistCreationConversation,
  runCreationWorkflow,
} from "@/lib/education/creation-workflow";

export const maxDuration = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeExtractedData(value: unknown): ExtractedData {
  return isRecord(value) ? value : {};
}

function normalizeCreationMessages(messages: readonly unknown[]): ChatMessage[] {
  return toPersistedUIChatMessages(messages, ["user", "assistant", "system", "tool"]).map(
    (message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      parts: message.parts,
      timestamp: message.timestamp,
    }),
  );
}

async function ensureCreationLease(input: {
  surveyId: string;
  userId: string;
  sessionId?: string | null;
  leaseToken?: string | null;
  force?: boolean;
}) {
  const activeLease = await getActiveSurveyLease(input.surveyId, "creation");

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

  return acquireSurveyLease({
    surveyId: input.surveyId,
    stage: "creation",
    userId: input.userId,
    sessionId: input.sessionId,
    force: input.force,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const permission = await getSurveyPermissionContext(
      session.user.id,
      surveyId,
      {
        activeWorkspaceId: session.session.activeOrganizationId ?? null,
      },
    );

    if (!permission?.canView || !permission.activeContextMatchesResource) {
      return new Response("Unauthorized", { status: 403 });
    }

    const [survey, creationConversation, revision, lease] = await Promise.all([
      getDb()
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .then((rows) => rows[0]),
      getDb()
        .select()
        .from(surveyCreationConversations)
        .where(eq(surveyCreationConversations.surveyId, surveyId))
        .then((rows) => rows[0]),
      getCurrentSurveyRevision(surveyId),
      getActiveSurveyLease(surveyId, "creation"),
    ]);

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    return NextResponse.json({
      surveyId,
      status: survey.status,
      revision,
      permission,
      lease,
      messages: creationConversation?.messages || [],
      collectedInfo: creationConversation?.collectedInfo || {},
      extractedData: creationConversation?.extractedData || {},
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return new Response(error.message, { status: 401 });
    }
    console.error("[Create Route GET] Error:", error);
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
    const incomingMessages = Array.isArray(body.messages)
      ? body.messages
      : null;
    if (!incomingMessages)
      return new Response("Invalid messages", { status: 400 });

    const [survey, existingConversation] = await Promise.all([
      getDb()
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .then((rows) => rows[0]),
      getDb()
        .select()
        .from(surveyCreationConversations)
        .where(eq(surveyCreationConversations.surveyId, surveyId))
        .then((rows) => rows[0]),
    ]);
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(
      session.user.id,
      survey.id,
      {
        activeWorkspaceId: session.session.activeOrganizationId ?? null,
      },
    );
    if (!permission?.canEdit || !permission.activeContextMatchesResource) {
      return new Response("Unauthorized: Editor access required", {
        status: 403,
      });
    }
    if (survey.status !== "creating") {
      return new Response(
        `Survey is not in creation mode. Status: ${survey.status}`,
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

    const leaseResult = await ensureCreationLease({
      surveyId,
      userId: session.user.id,
      sessionId:
        typeof body.sessionId === "string"
          ? body.sessionId
          : session.session.id,
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

    const messages = normalizeCreationMessages(incomingMessages);
    await persistCreationConversation(surveyId, messages);

    const result = await runCreationWorkflow({
      surveyId,
      organizationId: survey.organizationId,
      messages,
      userId: session.user.id,
    });
    const mediaDecision = deriveCreationMediaDecision({
      extractedData: normalizeExtractedData(existingConversation?.extractedData),
      messages,
    });
    const extractedData = buildCreationExtractedData({
      brief: result.brief,
      validation: result.validation,
      mediaDecision,
    });
    const collectedInfo = buildCreationCollectedInfo({
      brief: result.brief,
      validation: result.validation,
      mediaDecision,
    });

    await getDb()
      .update(surveyCreationConversations)
      .set({
        extractedData,
        collectedInfo,
        updatedAt: new Date(),
      })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    const creationState: CreationAgentState = {
      surveyId,
      messages: messages
        .filter(
          (
            message,
          ): message is ChatMessage & { role: "user" | "assistant" } =>
            message.role === "user" || message.role === "assistant",
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
        })),
      brief: result.brief,
      missingFields: result.validation.missingFields,
      readyForSampling:
        result.validation.isReady &&
        isCreationMediaDecisionResolved(mediaDecision),
      mediaDecision,
    };

    const systemPrompt = await buildCreationSystemPrompt(
      creationState,
      survey.organizationId,
    );
    const localizedSystemPrompt = `${systemPrompt}

Respond to the creator in the language they are speaking. Match the language of each creator message naturally.`;
    const modelMessages = await toModelMessages(incomingMessages);

    const tools = {
      finishSurvey: tool({
        description: getCreationFinishSurveyToolDefinition().description,
        inputSchema: z.object({}),
        execute: async () => {
          if (!result.validation.isReady) {
            return {
              error: "The brief is not complete enough to finish yet",
              missingFields: result.validation.missingFields,
            };
          }

          if (!isCreationMediaDecisionResolved(mediaDecision)) {
            return {
              error: "The media decision is not resolved yet",
              mediaDecision,
            };
          }

          return { success: true };
        },
      }),
      requestMediaUpload: tool({
        description: getCreationRequestMediaUploadToolDefinition().description,
        inputSchema: z.object({
          allowedTypes: z.array(z.string()).describe("Allowed media types, such as image, audio, or video."),
          recommendation: z.enum(["add_media", "not_needed"]).describe("Whether the assistant recommends adding media or thinks media is optional and not necessary."),
          rationale: z.string().describe("A short explanation of why media would help or why it is not necessary."),
          suggestedDescription: z.string().describe("Suggested description to prefill if the creator chooses to upload media."),
          suggestedFeedbackFocus: z.string().describe("Suggested feedback focus or learning goal for the uploaded media."),
        }),
      }),
    };

    const stream = streamAIResponse(
      modelMessages,
      localizedSystemPrompt,
      {
        surveyId,
        userId: session.user.id,
        organizationId: survey.organizationId ?? undefined,
        maxTokens: 400,
        temperature: 0.4,
        tools,
        stopWhen: stepCountIs(5),
      },
    );

    const response = stream.toUIMessageStreamResponse({
      originalMessages: toUIMessages(messages),
      onFinish: async ({ messages: finishedMessages }) => {
        const persistedMessages = normalizeCreationMessages(finishedMessages);
        const finalMediaDecision = deriveCreationMediaDecision({
          extractedData,
          messages: persistedMessages,
        });
        await persistCreationConversation(surveyId, persistedMessages);
        await getDb()
          .update(surveyCreationConversations)
          .set({
            extractedData: buildCreationExtractedData({
              brief: result.brief,
              validation: result.validation,
              mediaDecision: finalMediaDecision,
            }),
            collectedInfo: buildCreationCollectedInfo({
              brief: result.brief,
              validation: result.validation,
              mediaDecision: finalMediaDecision,
            }),
            updatedAt: new Date(),
          })
          .where(eq(surveyCreationConversations.surveyId, surveyId));

        await getDb().transaction(async (tx) => {
          await recordRealtimeEvent(tx, {
            scope: "survey",
            surveyId,
            workspaceId: permission.workspaceId,
            eventType: "survey.creation_turn_added",
            actorId: session.user.id,
            payload: {
              surveyId,
              lease: leaseResult.lease,
              messages: persistedMessages.slice(-2).map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                parts: message.parts,
                timestamp: message.timestamp,
              })),
              status: "creating",
            },
          });
        });
      },
    });

    response.headers.set("X-Survey-Revision", String(currentRevision + 1));
    response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
    return response;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return new Response(error.message, { status: 401 });
    }
    console.error("[Create Route] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(
      session.user.id,
      survey.id,
      {
        activeWorkspaceId: session.session.activeOrganizationId ?? null,
      },
    );
    if (!permission?.canEdit || !permission.activeContextMatchesResource) {
      return new Response("Unauthorized: Editor access required", {
        status: 403,
      });
    }

    if (
      typeof body.expectedRevision === "number" &&
      body.expectedRevision !== (await getCurrentSurveyRevision(surveyId))
    ) {
      return NextResponse.json({ error: "REVISION_CONFLICT" }, { status: 409 });
    }

    if (incomingMessages.length === 0) {
      return new Response("OK", { status: 200 });
    }

    const leaseResult = await ensureCreationLease({
      surveyId,
      userId: session.user.id,
      sessionId:
        typeof body.sessionId === "string"
          ? body.sessionId
          : session.session.id,
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

    const normalizedMessages = normalizeCreationMessages(incomingMessages);
    await persistCreationConversation(surveyId, normalizedMessages);

    await getDb().transaction(async (tx) => {
      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.creation_turn_added",
        actorId: session.user.id,
        payload: {
          surveyId,
          lease: leaseResult.lease,
          messages: normalizedMessages.slice(-1),
          status: survey.status,
        },
      });
    });

    const revision = await getCurrentSurveyRevision(surveyId);
    const response = new Response("OK", { status: 200 });
    response.headers.set("X-Survey-Revision", String(revision));
    response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
    return response;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return new Response(error.message, { status: 401 });
    }
    console.error("[Create Route PUT] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
