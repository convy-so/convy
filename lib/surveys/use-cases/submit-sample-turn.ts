import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  tool,
} from "ai";
import type { ModelMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/lib/ai";
import { evaluateScopePolicy } from "@/lib/ai/scope-policy";
import { sanitizeUserInput } from "@/lib/ai/sanitization";
import { getDynamicFewShotExamples } from "@/lib/ai/few-shot-library";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/lib/chat-ui-messages";
import { SURVEY_COMPLETION_TAG } from "@/lib/chat-ui-signals";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  incrementSurveyRevision,
} from "@/lib/collaboration-service";
import {
  buildConductingSystemPromptParts,
  createInitialSessionState,
  evaluateConductingTurnState,
  persistConductingTurnTranscript,
  planConductingTurn,
  resolveActiveCoverageNode,
  resolveConductingTurnPlan,
} from "@/lib/education/conducting-runtime";
import { getSampleFinishSurveyToolDefinition } from "@/lib/education/agent-tools";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
  purgeSessionAnalyticsArtifacts,
  updateSessionState,
} from "@/lib/education/storage";
import { buildCanonicalConversationTurn } from "@/lib/respondent-conversation";
import type { ChatMessage } from "@/lib/chat-types";
import { apiError } from "@/lib/api/error-contract";
import type { AuthSessionWithUser } from "@/lib/auth";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

export const MAX_SAMPLE_CONVERSATIONS = 3;
export type SubmitSampleRouteBody = {
  conversationNumber?: number; messages?: unknown[]; expectedRevision?: number; sessionId?: string; leaseToken?: string; forceLease?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
export function parseSampleRouteBody(value: unknown): SubmitSampleRouteBody {
 if (!isRecord(value)) return {};
 return { conversationNumber: typeof value.conversationNumber==="number"?value.conversationNumber:undefined, messages:Array.isArray(value.messages)?value.messages:undefined, expectedRevision: typeof value.expectedRevision==="number"?value.expectedRevision:undefined, sessionId: typeof value.sessionId==="string"?value.sessionId:undefined, leaseToken: typeof value.leaseToken==="string"?value.leaseToken:undefined, forceLease: typeof value.forceLease==="boolean"?value.forceLease:undefined };
}

type SupportedLanguage = "en" | "fr" | "de" | "es" | "it";
function isSupportedLanguage(value: unknown): value is SupportedLanguage { return value==="en"||value==="fr"||value==="de"||value==="es"||value==="it"; }
function getSurveyLanguage(value: unknown): SupportedLanguage { return isSupportedLanguage(value)?value:"en"; }

async function ensureRehearsalLease(input:{surveyId:string;userId:string;sessionId?:string|null;leaseToken?:string|null;force?:boolean;}){
 const activeLease=await getActiveSurveyLease(input.surveyId,"rehearsal");
 if(activeLease&&activeLease.holderUserId!==input.userId&&(!input.leaseToken||input.leaseToken!==activeLease.leaseToken)){return {ok:false as const,error:"LEASE_CONFLICT",lease:activeLease};}
 if(activeLease&&activeLease.holderUserId===input.userId&&input.leaseToken===activeLease.leaseToken){return {ok:true as const,lease:activeLease};}
 return acquireSurveyLease({surveyId:input.surveyId,stage:"rehearsal",userId:input.userId,sessionId:input.sessionId,force:input.force});
}

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
      finishSurvey: tool({
        description: getSampleFinishSurveyToolDefinition().description,
        inputSchema: z.object({}),
        execute: async () => {
          const threshold =
            planRow.plan.completionRule.minimumRequiredNodeCoverage;
          if (
            currentSessionState.status !== "completed" &&
            currentSessionState.overallCoverage < threshold
          ) {
            return {
              error: "Interview coverage is not high enough to finish yet",
              currentCoverage: currentSessionState.overallCoverage,
              requiredCoverage: threshold,
            };
          }

          if (currentSessionState.status !== "completed") {
            currentSessionState = {
              ...currentSessionState,
              status: "completed",
              stopReason: "agent_finish_signal",
            };
            await updateSessionState(sessionRow.id, currentSessionState);
          }

          return { success: true, message: "Survey marked as complete" };
        },
      }),
    };

    const priorDriftCount = toPersistedUIChatMessages(
      sampleConversation.messages ?? [],
      ["user", "assistant"],
    ).filter(
      (message) =>
        message.role === "assistant" &&
        /let's stay focused on|we need to stay on the current objective/i.test(
          message.content,
        ),
    ).length;
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
        const redirectedMessages = toVisibleConversationMessages([
          ...canonicalTurn.canonicalMessages,
          redirectMessage,
        ]);
        await getDb()
          .update(sampleConversations)
          .set({
            messages: redirectedMessages,
            updatedAt: new Date(),
          })
          .where(eq(sampleConversations.id, sampleConversation.id));
        const revision = await incrementSurveyRevision(surveyId);


        const response = createUIMessageStreamResponse({
          stream: createUIMessageStream({
            execute: async ({ writer }) => {
              writer.write({
                id: redirectMessage.id,
                type: "text-start",
              });
              writer.write({
                id: redirectMessage.id,
                type: "text-delta",
                delta: scopeDecision.redirectMessage,
              });
              writer.write({
                id: redirectMessage.id,
                type: "text-end",
              });
            },
          }),
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
      const completionText = `${SURVEY_COMPLETION_TAG} ${turnPlan.assistantMessage.trim() || "Thank you. That gives me enough to stop this rehearsal."}`.trim();
      const completionMessage: ChatMessage = {
        id: nanoid(),
        role: "assistant",
        content: completionText,
        parts: [
          { type: "text", text: completionText },
          {
            type: "tool-result",
            toolCallId: `finish-survey-${nanoid(8)}`,
            toolName: "finishSurvey",
            result: { success: true, message: "Survey marked as complete" },
          },
        ],
        timestamp: new Date().toISOString(),
      };
      currentSessionState = {
        ...currentSessionState,
        status: "completed",
        stopReason: "planned_finish_signal",
        activeWorkflowDecision: {
          activeNodeId: null,
          rationale: turnPlan.reason,
          shouldStop: true,
        },
      };
      await updateSessionState(sessionRow.id, currentSessionState);
      const completedMessages = toVisibleConversationMessages([
        ...canonicalTurn.canonicalMessages,
        completionMessage,
      ]);
      await getDb()
        .update(sampleConversations)
        .set({
          messages: completedMessages,
          updatedAt: new Date(),
        })
        .where(eq(sampleConversations.id, sampleConversation.id));
      await purgeSessionAnalyticsArtifacts({
        surveyId,
        sessionId: sessionRow.id,
      }).catch((error) => {
        console.error(
          "[Sample Route] Failed to purge rehearsal analytics artifacts:",
          error,
        );
      });
      const revision = await incrementSurveyRevision(surveyId);

      const response = createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({
              id: completionMessage.id,
              type: "text-start",
            });
            writer.write({
              id: completionMessage.id,
              type: "text-delta",
              delta: completionText,
            });
            writer.write({
              id: completionMessage.id,
              type: "text-end",
            });
          },
        }),
      });
      response.headers.set("X-Survey-Revision", String(revision));
      response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
      response.headers.set(
        "X-Conversation-Number",
        conversationNumber.toString(),
      );
      response.headers.set(
        "X-Remaining-Samples",
        (MAX_SAMPLE_CONVERSATIONS - conversationNumber).toString(),
      );
      return response;
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
    const systemPrompt = `${promptParts.dynamicSystemPrompt}

Additional sample-session rules:
- Treat the creator exactly like a participant so they can feel the real interview flow.
- Honor the approved sample conducting profile precisely when it is present.
- Close naturally once the required education evidence is covered.
- Keep the exchange realistic and participant-centered.

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;

    const sanitizedCanonicalMessages = canonicalTurn.canonicalMessages.map((message) => {
      if (message.role !== "user") {
        return message;
      }

      return {
        ...message,
        content: sanitizeUserInput(message.content, {
          maxLength: 2000,
          allowNewlines: true,
        }),
      };
    });

    const modelMessages: ModelMessage[] =
      sanitizedCanonicalMessages.length > 0
        ? await toModelMessages(sanitizedCanonicalMessages)
        : [
            {
              role: "user",
              content:
                "Start the sample interview by greeting the participant and asking the first best question.",
            },
          ];

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
        const persistedMessages = toVisibleConversationMessages(
          toPersistedUIChatMessages(messages, ["user", "assistant"]),
        );

        await getDb()
          .update(sampleConversations)
          .set({
            messages: persistedMessages,
            updatedAt: new Date(),
          })
          .where(eq(sampleConversations.id, sampleConversation.id));
        await incrementSurveyRevision(surveyId).catch((error) => {
          console.error("[Sample Route] Failed to increment survey revision:", error);
        });

        if (persistedMessages.some((message) => message.role === "user")) {
          await persistConductingTurnTranscript({
            surveyId,
            sessionId: sessionRow.id,
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
      },
    });

    response.headers.set("X-Remaining-Samples", remainingSamples.toString());
    response.headers.set(
      "X-Conversation-Number",
      conversationNumber.toString(),
    );
    response.headers.set("X-Survey-Revision", String(currentRevision + 1));
    response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
    return response;

}
