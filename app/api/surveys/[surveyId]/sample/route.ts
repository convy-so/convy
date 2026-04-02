import { stepCountIs, tool } from "ai";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/lib/ai";
import {
  toPersistedUIChatMessages,
  toUIMessages,
  toVisibleConversationMessages,
} from "@/lib/chat-ui-messages";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import {
  buildConductingSystemPromptParts,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import {
  getSampleFinishSurveyToolDefinition,
  getShowMediaToolDefinition,
} from "@/lib/education/agent-tools";
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
import { getClientIP, apiRateLimiter } from "@/lib/ratelimit";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export const maxDuration = 300;
const MAX_SAMPLE_CONVERSATIONS = 3;
type SupportedLanguage = "en" | "fr" | "de" | "es" | "it";
type SampleRouteBody = {
  conversationNumber?: number;
  messages?: unknown[];
  expectedRevision?: number;
  sessionId?: string;
  leaseToken?: string;
  forceLease?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de" ||
    value === "es" ||
    value === "it"
  );
}

function getSurveyLanguage(value: unknown): SupportedLanguage {
  return isSupportedLanguage(value) ? value : "en";
}

function parseSampleRouteBody(value: unknown): SampleRouteBody {
  if (!isRecord(value)) {
    return {};
  }

  return {
    conversationNumber:
      typeof value.conversationNumber === "number"
        ? value.conversationNumber
        : undefined,
    messages: Array.isArray(value.messages) ? value.messages : undefined,
    expectedRevision:
      typeof value.expectedRevision === "number"
        ? value.expectedRevision
        : undefined,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
    leaseToken:
      typeof value.leaseToken === "string" ? value.leaseToken : undefined,
    forceLease: typeof value.forceLease === "boolean" ? value.forceLease : undefined,
  };
}

type SurveyMedia = {
  id: string;
  type: "image" | "audio" | "video";
  url: string;
  description: string;
  altText?: string;
  durationMs?: number | null;
};

function normalizeSurveyMedia(value: unknown): SurveyMedia[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.url !== "string") {
      return [];
    }

    if (
      item.type !== "image" &&
      item.type !== "audio" &&
      item.type !== "video"
    ) {
      return [];
    }

    return [{
      id: item.id,
      type: item.type,
      url: item.url,
      description: typeof item.description === "string" ? item.description : "",
      altText: typeof item.altText === "string" ? item.altText : undefined,
      durationMs:
        typeof item.durationMs === "number" ? item.durationMs : undefined,
    }];
  });
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

  return acquireSurveyLease({
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
    const conversationNumber = Number(
      searchParams.get("conversationNumber") || 1,
    );

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(
      session.user.id,
      survey.id,
    );
    if (!permission?.canView)
      return new Response("Unauthorized", { status: 403 });

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
      messages: toVisibleConversationMessages(
        toPersistedUIChatMessages(sample?.messages ?? [], ["user", "assistant"]),
      ),
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
    const body = parseSampleRouteBody(await request.json());
    const conversationNumber = Number(body.conversationNumber || 1);
    const rawMessages = body.messages ?? [];

    if (
      conversationNumber < 1 ||
      conversationNumber > MAX_SAMPLE_CONVERSATIONS
    ) {
      return new Response(
        `Invalid conversation number. Must be between 1 and ${MAX_SAMPLE_CONVERSATIONS}`,
        { status: 400 },
      );
    }

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey) return new Response("Survey not found", { status: 404 });

    const permission = await getSurveyPermissionContext(
      session.user.id,
      survey.id,
    );
    if (!permission?.canEdit) {
      return new Response("Unauthorized: Editor access required", {
        status: 403,
      });
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

    const promptParts = buildConductingSystemPromptParts({
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      sessionState: sessionRow.sessionState,
      sessionType: "sample",
      conductingProfile: activeSampleProfile?.profile ?? null,
      playbookContext: runtimeLayers.playbookContext,
      personalityContext: runtimeLayers.personalityContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: (survey.media || []).length > 0,
      },
    });
    const systemPrompt = `${promptParts.dynamicSystemPrompt}

Additional sample-session rules:
- Treat the creator exactly like a participant so they can feel the real interview flow.
- Honor the approved sample conducting profile precisely when it is present.
- Close naturally once the required education evidence is covered.
- Keep the exchange realistic and participant-centered.

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;

    let currentSessionState = sessionRow.sessionState;
    let completedByTool = false;
    const surveyMedia = normalizeSurveyMedia(survey.media);
    const hasMedia = surveyMedia.length > 0;

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

          completedByTool = true;
          return { success: true, message: "Survey marked as complete" };
        },
      }),
      ...(hasMedia
        ? {
            showMedia: tool({
              description: getShowMediaToolDefinition().description,
              inputSchema: z.object({
                mediaId: z.string().describe("The media identifier to display."),
              }),
              execute: async ({ mediaId }: { mediaId: string }) => {
                const media = surveyMedia.find((item) => item.id === mediaId);
                if (!media) {
                  return { error: "Media not found" };
                }

                return {
                  success: true,
                  media: {
                    id: media.id,
                    type: media.type,
                    url: media.url,
                    description: media.description,
                    altText: media.altText,
                    durationMs: media.durationMs,
                  },
                };
              },
            }),
          }
        : {}),
    };

    const modelMessages =
      rawMessages.length > 0
        ? await toModelMessages(rawMessages)
        : [
            {
              role: "user" as const,
              content:
                "Start the sample interview by greeting the participant and asking the first best question.",
            },
          ];

    const result = streamAIResponse(modelMessages, systemPrompt, {
      surveyId,
      userId: session.user.id,
      maxTokens: 500,
      temperature: 0.4,
      promptCache: {
        namespace: "conducting-sample",
        staticSystemPrompt: promptParts.staticSystemPrompt,
      },
      tools,
      stopWhen: stepCountIs(5),
    });

    const persistedIncomingMessages = toPersistedUIChatMessages(rawMessages, ["user", "assistant"]);
    const remainingSamples = MAX_SAMPLE_CONVERSATIONS - conversationNumber;
    const response = result.toUIMessageStreamResponse({
      originalMessages: toUIMessages(persistedIncomingMessages),
      onFinish: async ({ messages }) => {
        const persistedMessages = toVisibleConversationMessages(
          toPersistedUIChatMessages(messages, ["user", "assistant"]),
        );

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

        if (persistedMessages.some((message) => message.role === "user")) {
          if (!completedByTool) {
            const { nextState } = await finalizeConductingTurn({
              surveyId,
              sessionId: sessionRow.id,
              brief: briefRow.brief,
              coveragePlan: planRow.plan,
              sessionState: currentSessionState,
              messages: persistedMessages,
            });
            currentSessionState = nextState;
          }

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
  } catch (error) {
    console.error("[Sample Route] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
