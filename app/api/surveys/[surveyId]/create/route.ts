import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/shared/db";
import { surveyCreationConversations } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { type ChatMessage } from "@/shared/chat/chat-types";
import {
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  incrementSurveyRevision,
} from "@/features/surveys/server/collaboration-service";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import {
  deriveCreationMediaDecision,
} from "@/features/surveys/server/education/agent-tools";
import {
  buildCreationCollectedInfo, buildCreationExtractedData,
} from "@/features/surveys/server/education/creation-state";
import {
  persistCreationConversation,
  runCreationWorkflow,
} from "@/features/surveys/server/education/creation-workflow";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";
import { getResearchBrief } from "@/features/surveys/server/education/storage/brief-storage";
import {
  ensureCreationLease,
  loadSurveyCreationContext,
  normalizeCreationMessages,
  normalizeExtractedData,
} from "@/features/surveys/server/education/survey-create-orchestrator";
import { SURVEY_STATUS } from "@/shared/surveys/constants";
import { getSurveyCreationStateViewModel } from "@/features/surveys/server/use-cases/get-survey-creation-state";


export const maxDuration = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBriefReadyForSampling(brief: Awaited<ReturnType<typeof getResearchBrief>>) {
  if (!brief) return false;
  return (
    brief.completenessStatus === "ready" ||
    brief.approvalState === "sample_ready" ||
    Boolean((brief.brief as { readyForSampling?: boolean } | null)?.readyForSampling)
  );
}


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [creationState, revision, lease] = await Promise.all([
      getSurveyCreationStateViewModel(surveyId, session),
      getCurrentSurveyRevision(surveyId),
      getActiveSurveyLease(surveyId, "creation"),
    ]);

    return NextResponse.json({
      ...creationState,
      revision,
      lease,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Survey not found") {
        return apiError("NOT_FOUND", error.message);
      }
      if (error.message === "Unauthorized") {
        return apiError("UNAUTHORIZED", error.message);
      }
    }
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "survey-create:get");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return apiError("VALIDATION_ERROR", "Invalid request body");
    }

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
    if (survey.status !== SURVEY_STATUS.CREATING) {
      return apiError("VALIDATION_ERROR", `Survey is not in creation mode. Status: ${survey.status}`);
    }

    const briefRow = await getResearchBrief(surveyId);
    if (isBriefReadyForSampling(briefRow)) {
      return apiError(
        "CONFLICT",
        "Survey brief is already ready for sample review",
      );
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
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
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
        execute: ({ writer }) => {
          writer.write({
            id: assistantMessageId,
            type: "text-start",
          });
          writer.write({
            id: assistantMessageId,
            type: "text-delta",
            delta: result.responseText,
          });
          writer.write({
            id: assistantMessageId,
            type: "text-end",
          });
        },
      }),
    });

    response.headers.set("X-Survey-Revision", String(nextRevision));
    response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
    return response;
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
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
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return apiError("VALIDATION_ERROR", "Invalid request body");
    }

    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

    const { survey } = await loadSurveyCreationContext(surveyId);
    if (!survey) return apiError("NOT_FOUND", "Survey not found");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return apiError("UNAUTHORIZED", "Editor access required");
    }

    const briefRow = await getResearchBrief(surveyId);
    if (isBriefReadyForSampling(briefRow)) {
      return apiError(
        "CONFLICT",
        "Survey brief is already ready for sample review",
      );
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
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "survey-create:put");
  }
}

