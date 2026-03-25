import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { WebSocket } from "ws";

import { getDb } from "@/db";
import { surveyConversations, surveys, voiceSessions } from "@/db/schema";
import {
  buildConductingSystemPrompt,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  updateSessionState,
} from "@/lib/education/storage";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import type {
  CoveragePlan,
  ResearchBrief,
  SessionState,
} from "@/lib/education/types";
import { enqueueConversationInsights } from "@/lib/queue";
import {
  buildVoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentFunction,
  type VoiceAgentSettings,
} from "@/lib/voice/deepgram-voice-agent";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";

const ESTIMATED_STT_COST_PER_MINUTE = 0.0059;
const ESTIMATED_TTS_COST_PER_CHAR = 0.000015;

interface ResponseState {
  surveyId: string;
  conversationId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  survey: typeof surveys.$inferSelect | null;
  language: SupportedLanguage;
  brief: ResearchBrief | null;
  coveragePlan: CoveragePlan | null;
  sessionId: string | null;
  sessionState: SessionState | null;
}

function buildVoiceFunctions(
  survey: typeof surveys.$inferSelect | null,
): VoiceAgentFunction[] {
  const functions: VoiceAgentFunction[] = [
    {
      name: "finishSurvey",
      description:
        "Call this only when the interview has gathered enough evidence and you are ready to close the participant interview naturally.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ];

  if ((survey?.media || []).length > 0) {
    functions.unshift({
      name: "showMedia",
      description:
        "Display a survey media asset when it is directly relevant to the current question.",
      parameters: {
        type: "object",
        properties: {
          mediaId: { type: "string", description: "The media identifier to display." },
        },
        required: ["mediaId"],
        additionalProperties: false,
      },
    });
  }

  return functions;
}

export class SurveyResponseVoiceHandler extends BaseVoiceAgentHandler {
  private state: ResponseState;
  private participantId: string;
  private sessionStartTime = Date.now();
  private cleanupStarted = false;
  private ownerId: string | null = null;

  constructor(
    ws: WebSocket,
    surveyId: string,
    identifier: string,
    language?: string,
  ) {
    super(ws, identifier);

    this.participantId = nanoid();
    this.state = {
      surveyId,
      conversationId: null,
      voiceSessionId: nanoid(),
      messages: [],
      survey: null,
      language: (language as SupportedLanguage) || "en",
      brief: null,
      coveragePlan: null,
      sessionId: null,
      sessionState: null,
    };
  }

  async initialize(): Promise<void> {
    try {
      const survey = await getDb()
        .select()
        .from(surveys)
        .where(eq(surveys.shareableLink, this.state.surveyId))
        .then((rows) => rows[0]);

      if (!survey) {
        this.sendError("Survey not found");
        this.ws.close();
        return;
      }

      if (survey.status !== "active") {
        this.sendError("Survey is not active");
        this.ws.close();
        return;
      }

      if (survey.currentParticipants >= survey.participantLimit) {
        this.sendError("Survey has reached participant limit");
        this.ws.close();
        return;
      }

      const [briefRow, planRow] = await Promise.all([
        getResearchBrief(survey.id),
        getActiveCoveragePlan(survey.id),
      ]);
      if (!briefRow || !planRow) {
        this.sendError("This survey is not ready for education interviews yet.");
        this.ws.close();
        return;
      }

      this.state.survey = survey;
      this.state.brief = briefRow.brief;
      this.state.coveragePlan = planRow.plan;
      this.surveyId = survey.id;
      this.organizationId = survey.organizationId;
      this.ownerId = survey.userId;

      if (!this.state.language || this.state.language === "en") {
        this.state.language = (survey.language as SupportedLanguage) || "en";
      }

      await getDb().insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        sessionType: "survey_response",
        status: "active",
        startedAt: new Date(),
      });

      const conversationId = nanoid();
      await getDb().insert(surveyConversations).values({
        id: conversationId,
        surveyId: survey.id,
        participantId: this.participantId,
        rawConversation: [],
        completed: false,
        originalLanguage: this.state.language,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.state.conversationId = conversationId;

      const sessionRow = await ensureSession({
        surveyId: survey.id,
        sessionType: "live",
        sourceConversationId: conversationId,
        language: this.state.language,
        respondentId: this.participantId,
        initialState: createInitialSessionState({
          surveyId: survey.id,
          sessionId: nanoid(),
          sessionType: "live",
          language: this.state.language,
          coveragePlan: planRow.plan,
        }),
      });

      this.state.sessionId = sessionRow.id;
      this.state.sessionState = sessionRow.sessionState;
      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId,
        language: this.state.language,
      });

      await this.connectVoiceAgent();
    } catch (error) {
      console.error("[Survey Response Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
      this.ws.close();
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected getInitialUserInput(): string | null {
    if (this.state.messages.length === 0) {
      return "Start the interview now. Greet the participant and ask the first best question.";
    }

    const lastMessage = this.state.messages[this.state.messages.length - 1];
    if (lastMessage.role === "user") {
      return "The participant is resuming the interview. Briefly welcome them back, acknowledge their last answer, and continue naturally.";
    }

    return null;
  }

  protected isNewSession(): boolean {
    return this.state.messages.length === 0;
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    if (!this.state.survey || !this.state.brief || !this.state.coveragePlan || !this.state.sessionState) {
      throw new Error("Survey response voice state is incomplete");
    }

    const [activeLiveProfile, sampleFallbackProfile, runtimeLayers] = await Promise.all([
      getActiveConductingProfile(this.state.survey!.id, "live"),
      getActiveConductingProfile(this.state.survey!.id, "sample"),
      getConductingRuntimeLayers({
        surveyId: this.state.survey!.id,
        organizationId: this.state.survey!.organizationId,
        mode: "live",
      }),
    ]);
    const systemPrompt = buildConductingSystemPrompt({
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: this.state.sessionState,
      sessionType: "live",
      conductingProfile: activeLiveProfile?.profile ?? sampleFallbackProfile?.profile ?? null,
      playbookContext: runtimeLayers.playbookContext,
      personalityContext: runtimeLayers.personalityContext,
    });

    const tone = (this.state.survey.tone || "casual") as
      | "casual"
      | "formal"
      | "playful"
      | "empathetic";

    return buildVoiceAgentSettings({
      language: this.state.language,
      tone,
      systemPrompt,
      functions: buildVoiceFunctions(this.state.survey),
      conversationHistory:
        this.state.messages.length > 0
          ? this.state.messages.map((message) => ({
              role: message.role,
              content: message.content,
            }))
          : undefined,
    });
  }

  protected async onConversationText(event: ConversationTextEvent): Promise<void> {
    const now = new Date();
    const lastMessage = this.state.messages[this.state.messages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === event.role &&
      now.getTime() - new Date(lastMessage.timestamp).getTime() < 3000
    ) {
      lastMessage.content += ` ${event.content}`;
      lastMessage.timestamp = now.toISOString();
    } else {
      this.state.messages.push({
        role: event.role,
        content: event.content,
        timestamp: now.toISOString(),
      });
    }

    if (!this.state.conversationId) return;

    if (event.role === "user" && this.state.messages.filter((message) => message.role === "user").length === 1) {
      await getDb()
        .update(surveys)
        .set({ currentParticipants: sql`current_participants + 1` })
        .where(eq(surveys.id, this.state.survey!.id));
    }

    await getDb()
      .update(surveyConversations)
      .set({
        rawConversation: this.state.messages,
        updatedAt: new Date(),
      })
      .where(eq(surveyConversations.id, this.state.conversationId));

    if (
      event.role !== "assistant" ||
      !this.state.sessionId ||
      !this.state.sessionState ||
      !this.state.brief ||
      !this.state.coveragePlan ||
      !this.state.messages.some((message) => message.role === "user")
    ) {
      return;
    }

    const { nextState } = await finalizeConductingTurn({
      surveyId: this.state.survey!.id,
      sessionId: this.state.sessionId,
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: this.state.sessionState,
      messages: this.state.messages,
    });

    this.state.sessionState = nextState;
    await enqueueConversationInsights({
      conversationId: this.state.conversationId!,
      surveyId: this.state.survey!.id,
      userId: this.ownerId || this.state.survey!.userId,
    }).catch((error) => {
      console.error("[Survey Response Voice] Failed to enqueue analytics refresh:", error);
    });

    this.send({
      type: "progress",
      completionPercentage: Math.round(nextState.overallCoverage * 100),
      state: nextState.status,
      shouldWrapUp: nextState.status === "completed",
    });

    const [refreshedLiveProfile, refreshedSampleProfile, refreshedRuntimeLayers] = await Promise.all([
      getActiveConductingProfile(this.state.survey!.id, "live"),
      getActiveConductingProfile(this.state.survey!.id, "sample"),
      getConductingRuntimeLayers({
        surveyId: this.state.survey!.id,
        organizationId: this.state.survey!.organizationId,
        mode: "live",
      }),
    ]);
    const refreshedPrompt = buildConductingSystemPrompt({
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: nextState,
      sessionType: "live",
      conductingProfile: refreshedLiveProfile?.profile ?? refreshedSampleProfile?.profile ?? null,
      playbookContext: refreshedRuntimeLayers.playbookContext,
      personalityContext: refreshedRuntimeLayers.personalityContext,
    });
    this.voiceAgent?.updateThink({
      provider: { type: "open_ai", model: "gpt-4o-mini" },
      prompt: `${refreshedPrompt}\n\nRespond in the language the participant is speaking.`,
      functions: buildVoiceFunctions(this.state.survey),
    });

    if (nextState.status === "completed") {
      setTimeout(() => {
        this.send({ type: "survey_completed" });
        this.handleComplete();
      }, 1200);
    }
  }

  protected async onFunctionCall(event: FunctionCallRequestEvent): Promise<void> {
    switch (event.function_name) {
      case "showMedia": {
        const mediaId = event.input?.mediaId;
        const media = this.state.survey?.media?.find((item) => item.id === mediaId);

        if (!media) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Media not found" }),
          );
          return;
        }

        this.send({
          type: "display_media",
          media: {
            id: media.id,
            type: media.type,
            url: media.url,
            description: media.description,
            altText: media.altText,
            durationMs: media.durationMs,
          },
        });
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({
            success: true,
            media: {
              id: media.id,
              type: media.type,
              description: media.description,
            },
          }),
        );
        return;
      }

      case "finishSurvey": {
        if (!this.state.sessionState || !this.state.sessionId || !this.state.coveragePlan) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Session state not ready" }),
          );
          return;
        }

        const threshold = this.state.coveragePlan.completionRule.minimumRequiredNodeCoverage;
        if (
          this.state.sessionState.status !== "completed" &&
          this.state.sessionState.overallCoverage < threshold
        ) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({
              error: "Interview coverage is not high enough to finish yet",
              currentCoverage: this.state.sessionState.overallCoverage,
              requiredCoverage: threshold,
            }),
          );
          return;
        }

        const completedState: SessionState =
          this.state.sessionState.status === "completed"
            ? this.state.sessionState
            : {
                ...this.state.sessionState,
                status: "completed",
                stopReason: "agent_finish_signal",
              };

        if (completedState !== this.state.sessionState) {
          await updateSessionState(this.state.sessionId, completedState);
          this.state.sessionState = completedState;
        }

        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({ success: true, message: "Survey marked as complete" }),
        );

        setTimeout(() => {
          this.send({ type: "survey_completed" });
          this.handleComplete();
        }, 500);
        return;
      }

      default:
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({ error: `Unknown function: ${event.function_name}` }),
        );
    }
  }

  protected async handleControlMessage(message: any): Promise<void> {
    if (message.type === "complete") {
      await this.handleComplete();
    }
  }

  private async handleComplete(): Promise<void> {
    try {
      if (this.state.conversationId) {
        await getDb()
          .update(surveyConversations)
          .set({ completed: true, updatedAt: new Date() })
          .where(eq(surveyConversations.id, this.state.conversationId));

        try {
          await enqueueConversationInsights({
            conversationId: this.state.conversationId,
            surveyId: this.state.survey?.id || "",
            userId: this.ownerId || "",
          });
        } catch (error) {
          console.error("[Survey Response Voice] Failed to enqueue insights:", error);
        }
      }

      const sessionDurationMs = Date.now() - this.sessionStartTime;
      const durationMinutes = sessionDurationMs / 60000;
      const estimatedSttCost = durationMinutes * ESTIMATED_STT_COST_PER_MINUTE;
      const totalAssistantChars = this.state.messages
        .filter((message) => message.role === "assistant")
        .reduce((sum, message) => sum + message.content.length, 0);
      const estimatedTtsCost = totalAssistantChars * ESTIMATED_TTS_COST_PER_CHAR;
      const totalCost = estimatedSttCost + estimatedTtsCost;

      await getDb()
        .update(voiceSessions)
        .set({
          status: "completed",
          endedAt: new Date(),
          durationMs: sessionDurationMs,
          audioDurationMs: Math.round(this.activeDurationMs),
          totalCost: totalCost.toString(),
          sttCost: estimatedSttCost.toString(),
          ttsCost: estimatedTtsCost.toString(),
        })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      if (this.state.conversationId) {
        await getDb()
          .update(surveyConversations)
          .set({
            durationMs: sessionDurationMs,
            activeDurationMs: Math.round(this.activeDurationMs),
          })
          .where(eq(surveyConversations.id, this.state.conversationId));
      }

      this.send({
        type: "completed",
        conversationId: this.state.conversationId,
      });
      this.ws.close();
    } catch (error) {
      console.error("[Survey Response Voice] Completion error:", error);
      this.send({ type: "error", error: "Failed to complete survey" });
    }
  }

  protected async cleanup(): Promise<void> {
    if (this.cleanupStarted) return;
    this.cleanupStarted = true;

    try {
      await super.cleanup();

      const sessionDurationMs = Date.now() - this.sessionStartTime;
      const [session] = await getDb()
        .select()
        .from(voiceSessions)
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      if (!session) return;

      const newStatus = session.status === "active" ? "abandoned" : session.status;
      const durationMinutes = sessionDurationMs / 60000;
      const estimatedSttCost = durationMinutes * ESTIMATED_STT_COST_PER_MINUTE;
      const totalAssistantChars = this.state.messages
        .filter((message) => message.role === "assistant")
        .reduce((sum, message) => sum + message.content.length, 0);
      const estimatedTtsCost = totalAssistantChars * ESTIMATED_TTS_COST_PER_CHAR;
      const totalCost = estimatedSttCost + estimatedTtsCost;

      if (this.state.conversationId && this.state.messages.length === 0) {
        await getDb()
          .delete(surveyConversations)
          .where(eq(surveyConversations.id, this.state.conversationId));
      }

      await getDb()
        .update(voiceSessions)
        .set({
          status: newStatus,
          endedAt: new Date(),
          durationMs: sessionDurationMs,
          audioDurationMs: Math.round(this.activeDurationMs),
          totalCost: totalCost.toString(),
          sttCost: estimatedSttCost.toString(),
          ttsCost: estimatedTtsCost.toString(),
        })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      if (this.state.conversationId) {
        await getDb()
          .update(surveyConversations)
          .set({
            durationMs: sessionDurationMs,
            activeDurationMs: Math.round(this.activeDurationMs),
          })
          .where(eq(surveyConversations.id, this.state.conversationId));
      }
    } catch (error) {
      console.error("[Survey Response Voice] Cleanup error:", error);
    }
  }
}
