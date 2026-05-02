import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { type ChatMessage } from "@/lib/chat-types";
import {
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  incrementSurveyRevision,
} from "@/lib/collaboration-service";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
import { getRateLimitKey, apiRateLimiter } from "@/lib/ratelimit";
import {
  deriveCreationMediaDecision,
} from "@/lib/education/agent-tools";
import {
  buildCreationCollectedInfo, buildCreationExtractedData,
} from "@/lib/education/creation-state";
import {
  persistCreationConversation,
  runCreationWorkflow,
} from "@/lib/education/creation-workflow";
import { evaluateScopePolicy } from "@/lib/ai/scope-policy";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import {
  ensureCreationLease,
  loadSurveyCreationContext,
  normalizeCreationMessages,
  normalizeExtractedData,
} from "@/lib/education/survey-create-orchestrator";


export const maxDuration = 300;


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canView")) {
      return apiError("UNAUTHORIZED", "Unauthorized");
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
      return apiError("NOT_FOUND", "Survey not found");
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
      return apiError("UNAUTHENTICATED", error.message);
    }
    return apiUnhandledError(error, "Internal server error", "survey-create:get");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const rateLimitResult = await apiRateLimiter.limit(
      getRateLimitKey(request, {
        userId: session.user.id,
        scope: "survey-create:post",
      }),
    );
    if (!rateLimitResult.success) {
      return apiError("RATE_LIMITED", "Rate limit exceeded", {
        details: { retryAfter: rateLimitResult.reset },
      });
    }

    const { surveyId } = await params;
    const body = await request.json();
    const incomingMessages = Array.isArray(body.messages)
      ? body.messages
      : null;
    if (!incomingMessages)
      return apiError("VALIDATION_ERROR", "Invalid messages");

    const { survey, existingConversation } =
      await loadSurveyCreationContext(surveyId);
    if (!survey) return apiError("NOT_FOUND", "Survey not found");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return apiError("UNAUTHORIZED", "Editor access required");
    }
    if (survey.status !== "creating") {
      return apiError("VALIDATION_ERROR", `Survey is not in creation mode. Status: ${survey.status}`);
    }

    const currentRevision = await getCurrentSurveyRevision(surveyId);
    if (
      typeof body.expectedRevision === "number" &&
      body.expectedRevision !== currentRevision
    ) {
      return apiError("CONFLICT", "REVISION_CONFLICT", { details: { currentRevision } });
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
      return apiError("CONFLICT", leaseResult.error, {
        details: {
          lease: "lease" in leaseResult ? leaseResult.lease : null,
        },
      });
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
        const revision = await incrementSurveyRevision(surveyId);


        const response = createUIMessageStreamResponse({
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
        response.headers.set("X-Survey-Revision", String(revision));
        response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
        return response;
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
    const nextRevision = await incrementSurveyRevision(surveyId);

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

    response.headers.set("X-Survey-Revision", String(nextRevision));
    response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
    return response;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return apiError("UNAUTHENTICATED", error.message);
    }
    return apiUnhandledError(error, "Internal server error", "survey-create:post");
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

    const { survey } = await loadSurveyCreationContext(surveyId);
    if (!survey) return apiError("NOT_FOUND", "Survey not found");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return apiError("UNAUTHORIZED", "Editor access required");
    }

    if (
      typeof body.expectedRevision === "number" &&
      body.expectedRevision !== (await getCurrentSurveyRevision(surveyId))
    ) {
      return apiError("CONFLICT", "REVISION_CONFLICT");
    }

    if (incomingMessages.length === 0) {
      return NextResponse.json({ success: true });
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
      return apiError("CONFLICT", leaseResult.error, {
        details: {
          lease: "lease" in leaseResult ? leaseResult.lease : null,
        },
      });
    }

    const normalizedMessages = normalizeCreationMessages(incomingMessages);
    await persistCreationConversation(surveyId, normalizedMessages);

    const revision = await incrementSurveyRevision(surveyId);
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
      return apiError("UNAUTHENTICATED", error.message);
    }
    return apiUnhandledError(error, "Internal server error", "survey-create:put");
  }
}

