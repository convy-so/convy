import {
  stepCountIs,
} from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import { streamAIResponse } from "@/shared/ai";
import { evaluateScopePolicy } from "@/shared/ai/scope-policy";
import { getDynamicFewShotExamples } from "@/shared/ai/few-shot-library";
import {
  getCurrentSurveyRevision,
  incrementSurveyRevision,
} from "@/features/surveys/server/collaboration-service";
import {
  buildConductingSystemPromptParts,
  createInitialSessionState,
  evaluateConductingTurnState,
  planConductingTurn,
  resolveActiveCoverageNode,
  resolveConductingTurnPlan,
} from "@/features/surveys/server/education/conducting-runtime";
import { getConductingRuntimeLayers } from "@/features/surveys/server/education/runtime-context";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
} from "@/features/surveys/server/education/storage";
import { buildCanonicalConversationTurn } from "@/features/surveys/server/respondent-conversation";
import type { ChatMessage } from "@/shared/chat/chat-types";
import { apiError } from "@/shared/http/api-error";
import type { AuthSessionWithUser } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import {
  countScopeRedirects,
  applySampleResponseHeaders,
  buildSampleModelMessages,
  buildSampleSystemPrompt,
  createSingleMessageStreamResponse,
  ensureRehearsalLease,
  ensureSampleConversation,
  finalizePlannedSampleTurn,
  getSurveyLanguage,
  MAX_SAMPLE_CONVERSATIONS,
  parseSampleRouteBody,
  persistSampleRedirect,
  persistSampleStreamResult,
  type SubmitSampleRouteBody,
} from "./submit-sample-turn-helpers";
import { createSampleFinishSurveyTool } from "./sample-finish-tool";

export { parseSampleRouteBody };
export type { SubmitSampleRouteBody };

export async function submitSampleTurn(input:{surveyId:string;session:AuthSessionWithUser;body:SubmitSampleRouteBody;}):Promise<Response>{
 const {surveyId,session,body}=input;
    const conversationNumber = Number(body.conversationNumber || 1);
    const rawMessages = body.messages ?? [];

    if (
      conversationNumber < 1 ||
      conversationNumber > MAX_SAMPLE_CONVERSATIONS
    ) {
      return apiError(
        "VALIDATION_ERROR",
        `Invalid conversation number. Must be between 1 and ${MAX_SAMPLE_CONVERSATIONS}`,
      );
    }

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id,);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return apiError("UNAUTHORIZED", "Editor access required");
    }
    if (survey.status !== "draft" && survey.status !== "sample_review") {
      return apiError(
        "VALIDATION_ERROR",
        "Survey must be in draft or sample_review status for sample conversations",
      );
    }

    const currentRevision = await getCurrentSurveyRevision(surveyId);
    if (
      typeof body.expectedRevision === "number" &&
      body.expectedRevision !== currentRevision
    ) {
      return apiError("CONFLICT", "REVISION_CONFLICT", {
        details: { currentRevision },
      });
    }

    const leaseResult = await ensureRehearsalLease({
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

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);
    if (!briefRow || !planRow) {
      return apiError(
        "VALIDATION_ERROR",
        "This survey does not have an approved education brief yet.",
      );
    }

    const [activeSampleProfile, runtimeLayers] = await Promise.all([
      getActiveConductingProfile(surveyId, "sample"),
      getConductingRuntimeLayers({
        surveyId,
        classroomId: survey.classroomId,
        programId: survey.programId,
        language: getSurveyLanguage(survey.language),
        mode: "sample",
      }),
    ]);

    const sampleConversation = await ensureSampleConversation({
      surveyId,
      survey,
      conversationNumber,
    });

    const canonicalTurn = buildCanonicalConversationTurn({
      storedMessages: sampleConversation.messages ?? [],
      incomingMessages: rawMessages,
    });
    const latestUserMessage = canonicalTurn.latestUserMessage;

    const sourceId = sampleConversation.id;
    let sessionRow = await getSessionBySourceId(sourceId);
    if (!sessionRow) {
      sessionRow = await ensureSession({
        surveyId,
        sessionType: "sample",
        sourceConversationId: sourceId,
        language: getSurveyLanguage(survey.language),
        initialState: createInitialSessionState({
          surveyId,
          sessionId: nanoid(),
          sessionType: "sample",
          language: getSurveyLanguage(survey.language),
          coveragePlan: planRow.plan,
        }),
      });
    }
    const activeNode = resolveActiveCoverageNode(
      sessionRow.sessionState,
      planRow.plan,
    );

    let currentSessionState = sessionRow.sessionState;

    const tools = {
      finishSurvey: createSampleFinishSurveyTool({
        sessionId: sessionRow.id,
        minimumCoverage:
          planRow.plan.completionRule.minimumRequiredNodeCoverage,
        getCurrentSessionState: () => currentSessionState,
        setCurrentSessionState: (nextState) => {
          currentSessionState = nextState;
        },
      }),
    };

    const priorDriftCount = countScopeRedirects(
      sampleConversation.messages ?? [],
    );
    if (latestUserMessage) {
      const scopeDecision = await evaluateScopePolicy({
        feature: "survey_sample",
        objective: briefRow.brief.researchGoal,
        currentPhase: "sample review",
        activeTopic: activeNode?.label ?? briefRow.brief.title,
        latestUserMessage,
        strictMode: true,
        driftCount: priorDriftCount,
        allowedDetours: [
          "brief clarification of the current interview question",
          "discussion tied directly to the approved survey brief",
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
        await persistSampleRedirect({
          conversationId: sampleConversation.id,
          messages: canonicalTurn.canonicalMessages,
          redirectMessage,
        });
        const revision = await incrementSurveyRevision(surveyId);

        const response = createSingleMessageStreamResponse({
          messageId: redirectMessage.id,
          text: scopeDecision.redirectMessage,
        });
        response.headers.set("X-Survey-Revision", String(revision));
        response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
        return response;
      }
    }

    if (latestUserMessage) {
      const { nextState } = await evaluateConductingTurnState({
        surveyId,
        sessionId: sessionRow.id,
        brief: briefRow.brief,
        coveragePlan: planRow.plan,
        sessionState: currentSessionState,
        messages: canonicalTurn.canonicalMessages,
      });
      currentSessionState = nextState;
    }

    const planningActiveNode = resolveActiveCoverageNode(
      currentSessionState,
      planRow.plan,
    );
    const rawTurnPlan = await planConductingTurn({
      surveyId,
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      sessionState: currentSessionState,
      messages: canonicalTurn.canonicalMessages,
    });
    const turnPlan = resolveConductingTurnPlan({
      coveragePlan: planRow.plan,
      sessionState: currentSessionState,
      messages: canonicalTurn.canonicalMessages,
      plan: rawTurnPlan,
    });
    const promptSessionState =
      turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
        ? {
            ...currentSessionState,
            currentNodeId: turnPlan.targetNodeId,
          }
        : currentSessionState;
    const plannedActiveNode =
      turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
        ? planRow.plan.nodes.find((node) => node.id === turnPlan.targetNodeId) ??
          planningActiveNode
        : planningActiveNode;

    if (turnPlan?.action === "close") {
      return finalizePlannedSampleTurn({
        surveyId,
        conversationId: sampleConversation.id,
        sessionId: sessionRow.id,
        leaseToken: leaseResult.lease.leaseToken,
        conversationNumber,
        assistantMessage: turnPlan.assistantMessage,
        rationale: turnPlan.reason,
        currentSessionState,
        canonicalMessages: canonicalTurn.canonicalMessages,
      });
    }

    const fewShotExamples = await getDynamicFewShotExamples({
      feature: "survey_conducting",
      limit: 3,
      context: [survey.title, plannedActiveNode?.label, latestUserMessage]
        .filter(Boolean)
        .join(" | "),
    });

    const promptParts = buildConductingSystemPromptParts({
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      sessionState: promptSessionState,
      sessionType: "sample",
      turnPlan,
      conductingProfile: activeSampleProfile?.profile ?? null,
      expertGuidanceContext: runtimeLayers.expertGuidanceContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: false,
      },
    });
    const systemPrompt = buildSampleSystemPrompt({
      dynamicSystemPrompt: promptParts.dynamicSystemPrompt,
    });

    const modelMessages = await buildSampleModelMessages(
      canonicalTurn.canonicalMessages,
    );

    const result = streamAIResponse(modelMessages, systemPrompt, {
      attribution: {
        surveyId,
        userId: session.user.id,
        feature: "survey-conducting-sample",
      },
      maxTokens: 500,
      temperature: 0.4,
      promptCache: {
        namespace: "conducting-sample",
        staticSystemPrompt: promptParts.staticSystemPrompt,
      },
      tools,
      stopWhen: stepCountIs(5),
      dynamicExamples: fewShotExamples,
    });

    const remainingSamples = MAX_SAMPLE_CONVERSATIONS - conversationNumber;
    const response = result.toUIMessageStreamResponse({
      originalMessages: canonicalTurn.originalMessages,
      onFinish: async ({ messages }) => {
        await persistSampleStreamResult({
          surveyId,
          conversationId: sampleConversation.id,
          sessionId: sessionRow.id,
          messages,
        });
      },
    });

    applySampleResponseHeaders(response, {
      remainingSamples,
      conversationNumber,
      revision: currentRevision + 1,
      leaseToken: leaseResult.lease.leaseToken,
    });
    return response;

}
