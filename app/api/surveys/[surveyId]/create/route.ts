import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getClientIP, apiRateLimiter } from "@/lib/ratelimit";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  publishPendingOutboxEntries,
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import {
  persistCreationConversation,
  runCreationWorkflow,
  type CreationMessage,
} from "@/lib/education/creation-workflow";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export const maxDuration = 300;

function normalizeMessages(messages: any[]): CreationMessage[] {
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
      } as CreationMessage;
    })
    .filter((message) => message.role === "user" || message.role === "assistant");
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

  return await acquireSurveyLease({
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
    const permission = await getSurveyPermissionContext(session.user.id, surveyId, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });

    if (!permission?.canView || !permission.activeContextMatchesResource) {
      return new Response("Unauthorized", { status: 403 });
    }

    const [survey, creationConversation, revision, lease] = await Promise.all([
      getDb().select().from(surveys).where(eq(surveys.id, surveyId)).then((rows) => rows[0]),
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
    const incomingMessages = Array.isArray(body.messages) ? body.messages : null;
    if (!incomingMessages) return new Response("Invalid messages", { status: 400 });

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(session.user.id, survey.id, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canEdit || !permission.activeContextMatchesResource) {
      return new Response("Unauthorized: Editor access required", { status: 403 });
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

    const messages = normalizeMessages(incomingMessages);
    await persistCreationConversation(surveyId, messages);
    const result = await runCreationWorkflow({
      surveyId,
      organizationId: survey.organizationId,
      messages,
      userId: session.user.id,
    });

    const assistantMessage: CreationMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.responseText,
      timestamp: new Date().toISOString(),
    };
    const persistedMessages = [...messages, assistantMessage];
    await persistCreationConversation(surveyId, persistedMessages);

    await getDb().transaction(async (tx) => {
      await tx
        .update(surveyCreationConversations)
        .set({
          extractedData: {
            programId: result.brief.programId,
            objective: {
              goal: result.brief.researchGoal,
              context: result.brief.learningContext,
              decision: result.brief.decisionToInform,
            },
            targetAudience: {
              description: result.brief.audienceDefinition,
              relationship: result.brief.audienceRelationship,
              knowledgeLevel: result.brief.audienceKnowledgeLevel,
            },
            scope: {
              breadthVsDepth: "balanced",
              mainTopics: result.brief.requiredTopics,
              boundaries: result.brief.deliveryContext,
            },
            successCriteria: {
              insightTypes: ["behavioral", "rational"],
              detailLevel: "high",
              description: result.brief.successCriteria.join(", "),
            },
            constraints: {
              timeLimit: null,
              sensitiveTopics: result.brief.riskFlags,
              otherConstraints: result.brief.constraints.join(", "),
            },
            tone: result.brief.tone,
            requiredQuestions: result.brief.requiredQuestions,
            metrics: result.brief.metrics,
            personalInfo: result.brief.personalInfo,
            brief: result.brief,
            missingFields: result.validation.missingFields,
            readyForSampling: result.validation.isReady,
          },
          collectedInfo: {
            objective: Boolean(result.brief.researchGoal),
            targetAudience: Boolean(result.brief.audienceDefinition),
            scope: result.brief.requiredTopics.length > 0,
            successCriteria: result.brief.successCriteria.length > 0,
            constraints: true,
            hypotheses: result.brief.assumptions.length > 0,
            tone: Boolean(result.brief.tone),
            requiredQuestions: result.brief.requiredQuestions.length > 0,
            metrics: true,
            personalInfo: true,
            subjectDefined: Boolean(result.brief.learningContext),
            programIdentified: Boolean(result.brief.programId),
            media: true,
            subjectModelComplete: result.validation.isReady,
          },
          updatedAt: new Date(),
        })
        .where(eq(surveyCreationConversations.surveyId, surveyId));

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.creation_turn_added",
        actorId: session.user.id,
        payload: {
          surveyId,
          lease: leaseResult.lease,
          messages: persistedMessages.slice(-2),
          status: "creating",
        },
      });
    });
    await publishPendingOutboxEntries();

    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({
            type: "text-delta",
            textDelta: result.responseText,
          } as any);
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

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(session.user.id, survey.id, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canEdit || !permission.activeContextMatchesResource) {
      return new Response("Unauthorized: Editor access required", { status: 403 });
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

    const normalizedMessages = normalizeMessages(incomingMessages);
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
    await publishPendingOutboxEntries();

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
