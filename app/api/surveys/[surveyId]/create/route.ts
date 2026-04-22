import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { toPersistedUIChatMessages } from "@/lib/chat-ui-messages";
import { type ChatMessage, type ExtractedData } from "@/lib/chat-types";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  getCurrentSurveyRevision,
} from "@/lib/collaboration-service";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import { getClientIP, apiRateLimiter } from "@/lib/ratelimit";
import {
  deriveCreationMediaDecision,
} from "@/lib/education/agent-tools";
import {
  buildCreationCollectedInfo,
  buildCreationExtractedData,
} from "@/lib/education/creation-state";
import {
  persistCreationConversation,
  runCreationWorkflow,
} from "@/lib/education/creation-workflow";
import { evaluateScopePolicy } from "@/lib/ai/scope-policy";
import { recordAiFeedbackEvent } from "@/lib/ai/observability";

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
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canView")) {
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

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
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
    const latestUserMessage =
      [...messages].reverse().find((message) => message.role === "user")?.content?.trim() ??
      "";
    const priorDriftCount = messages.filter(
      (message) =>
        message.role === "assistant" &&
        /let's stay focused on|we need to stay on the current objective/i.test(
          message.content,
        ),
    ).length;

    if (latestUserMessage) {
      const scopeDecision = await evaluateScopePolicy({
        feature: "survey_creation",
        objective: survey.coreObjective || survey.title,
        currentPhase: "survey creation",
        activeTopic: survey.title,
        latestUserMessage,
        strictMode: true,
        driftCount: priorDriftCount,
        allowedDetours: [
          "brief clarification of the current survey-design question",
          "discussion tied directly to the current brief or target audience",
        ],
      });

      if (scopeDecision.shouldRedirect) {
        const redirectMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: scopeDecision.redirectMessage,
          parts: [{ type: "text", text: scopeDecision.redirectMessage }],
          timestamp: new Date().toISOString(),
        };
        const redirectedMessages = [...messages, redirectMessage];
        await persistCreationConversation(surveyId, redirectedMessages);
        await recordAiFeedbackEvent({
          userId: session.user.id,
          source: "scope_policy",
          feedbackType:
            scopeDecision.promptInjectionSignal === "none"
              ? "redirected"
              : "prompt_injection_detected",
          payload: {
            surveyId,
            classification: scopeDecision.classification,
            promptInjectionSignal: scopeDecision.promptInjectionSignal,
            reason: scopeDecision.reason,
          },
        }).catch(() => undefined);

        return createUIMessageStreamResponse({
          stream: createUIMessageStream({
            execute: async ({ writer }) => {
              writer.write({
                id: redirectMessage.id,
                type: "text-delta",
                delta: scopeDecision.redirectMessage,
              });
            },
          }),
        });
      }
    }

    await persistCreationConversation(surveyId, messages);

    const result = await runCreationWorkflow({
      surveyId,
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
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.responseText,
      parts: [{ type: "text", text: result.responseText }],
      timestamp: new Date().toISOString(),
    };
    const persistedMessages = [...messages, assistantMessage];
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

    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({
            id: assistantMessage.id!,
            type: "text-delta",
            delta: result.responseText,
          });
        },
      }),
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

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
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
