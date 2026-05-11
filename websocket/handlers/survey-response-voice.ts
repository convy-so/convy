import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { WebSocket } from "ws";

import { getDb } from "@/db";
import { surveyConversations, surveys, voiceSessions } from "@/db/schema";
import {
  buildConductingSystemPrompt,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import { type ChatMessage } from "@/lib/chat-types";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/lib/chat-ui-messages";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
} from "@/lib/education/storage";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import { scheduleAnalyticsRefresh } from "@/lib/analytics-scheduler";
import type {
  CoveragePlan,
  ResearchBrief,
  SessionState,
} from "@/lib/education/types";
import { buildRespondentVoiceFunctions } from "@/lib/education/agent-tools";
import {
  buildVoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentSettings,
  VOICE_AGENT_THINK_MODEL,
} from "@/lib/voice/deepgram-voice-agent";
import {
  admitParticipantOnFirstUserTurn,
  buildRespondentVoiceGreeting,
  buildVoiceAgentKeyterms,
  getUsableRespondentMessages,
  hasUserTurn,
} from "@/lib/respondent-conversation";
import { normalizeVoiceLocale } from "@/lib/voice/voice-locales";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import {
  appendConversationText,
  buildConductingProgressPayload,
  resolveFinishSurveyRequest,
} from "./survey-voice-shared";
import * as Sentry from "@sentry/node";

const ESTIMATED_STT_COST_PER_MINUTE = 0.0059;
const ESTIMATED_TTS_COST_PER_CHAR = 0.000015;

interface ResponseState {
  surveyId: string;
  conversationId: string | null;
  voiceSessionId: string;
  messages: ChatMessage[];
  survey: typeof surveys.$inferSelect | null;
  language: SupportedLanguage;
  brief: ResearchBrief | null;
  coveragePlan: CoveragePlan | null;
  sessionId: string | null;
  sessionState: SessionState | null;
}

export class SurveyResponseVoiceHandler extends BaseVoiceAgentHandler {
  private state: ResponseState;
  private participantId: string;
  private sessionStartTime = Date.now();
  private cleanupStarted = false;
  private ownerId: string | null = null;
  private hasExplicitLanguage: boolean;

  constructor(
    ws: WebSocket,
    surveyId: string,
    conversationId: string,
    identifier: string,
    language?: string,
  ) {
    super(ws, identifier);

    this.participantId = "";
    this.hasExplicitLanguage = typeof language === "string" && language.length > 0;
    this.state = {
      surveyId,
      conversationId,
      voiceSessionId: nanoid(),
      messages: [],
      survey: null,
      language: normalizeVoiceLocale(language),
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
      this.ownerId = survey.userId;

      if (!this.hasExplicitLanguage) {
        this.state.language = normalizeVoiceLocale(survey.language);
      }

      const conversation = await getDb()
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.id, this.state.conversationId!))
        .then((rows) => rows[0]);

      if (!conversation || conversation.surveyId !== survey.id) {
        this.sendError("Conversation not found");
        this.ws.close();
        return;
      }

      this.participantId = conversation.participantId || nanoid(8);
      this.state.messages = getUsableRespondentMessages(
        toVisibleConversationMessages(
          toPersistedUIChatMessages(
            Array.isArray(conversation.rawConversation)
              ? conversation.rawConversation
              : [],
            ["user", "assistant"],
          ),
        ),
        survey.isVoice,
      );
      if (!conversation.participantId) {
        await getDb()
          .update(surveyConversations)
          .set({ participantId: this.participantId, updatedAt: new Date() })
          .where(eq(surveyConversations.id, conversation.id));
      }

      await getDb().insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        conversationId: conversation.id,
        sessionType: "survey_response",
        status: "active",
        startedAt: new Date(),
      });

      let sessionRow = await getSessionBySourceId(conversation.id);
      if (!sessionRow) {
        sessionRow = await ensureSession({
          surveyId: survey.id,
          sessionType: "live",
          sourceConversationId: conversation.id,
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
      }

      this.state.sessionId = sessionRow.id;
      this.state.sessionState = sessionRow.sessionState;
      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId: conversation.id,
        language: this.state.language,
      });

      await this.connectVoiceAgent();
    } catch (error) {
      Sentry.logger.error("Survey response voice: failed to initialize voice session", {
        service: "survey-response-voice",
        survey_id: this.state.surveyId,
        error_message: error instanceof Error ? error.message : String(error),
      });
      this.sendError("Failed to initialize voice session");
      this.ws.close();
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected getInitialUserInput(): string | null {
    if (this.state.messages.length === 0) {
      return null;
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
        classroomId: this.state.survey!.classroomId,
        programId: this.state.survey!.programId,
        language: this.state.language,
        mode: "live",
      }),
    ]);
    const systemPrompt = buildConductingSystemPrompt({
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: this.state.sessionState,
      sessionType: "live",
      conductingProfile: activeLiveProfile?.profile ?? sampleFallbackProfile?.profile ?? null,
      expertGuidanceContext: runtimeLayers.expertGuidanceContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: false,
      },
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
      functions: buildRespondentVoiceFunctions(
        false,
      ),
      keyterms: buildVoiceAgentKeyterms({
        surveyTitle: this.state.survey.title,
        requiredQuestions: this.state.survey.requiredQuestions,
        media: [],
        brief: this.state.brief,
      }),
      greeting:
        this.state.messages.length === 0
          ? buildRespondentVoiceGreeting({
              language: this.state.language,
              surveyTitle: this.state.survey.title,
              brief: this.state.brief,
            })
          : undefined,
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
    appendConversationText(this.state.messages, event);

    if (!this.state.conversationId) return;

    if (event.role === "user" && this.state.survey) {
      const admission = await admitParticipantOnFirstUserTurn({
        surveyId: this.state.survey.id,
        conversationId: this.state.conversationId,
      });

      if (!admission.allowed) {
        this.send({
          type: "error",
          error: "Survey has reached participant limit",
        });
        this.ws.close(1008, "Survey has reached participant limit");
        return;
      }
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
      !hasUserTurn(this.state.messages)
    ) {
      return;
    }

    const { nextState } = await finalizeConductingTurn({
      surveyId: this.state.survey!.id,
      sessionId: this.state.sessionId,
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: this.state.sessionState,
      messages: this.state.messages.map(m => ({
        ...m,
        id: m.id || nanoid(),
        timestamp: m.timestamp || new Date().toISOString()
      })),
    });

    this.state.sessionState = nextState;
    await scheduleAnalyticsRefresh({
      surveyId: this.state.survey!.id,
      userId: this.ownerId || this.state.survey!.userId,
    }).catch((error) => {
      Sentry.logger.error("Survey response voice: failed to schedule analytics refresh", {
        service: "survey-response-voice",
        survey_id: this.state.survey?.id ?? "",
        conversation_id: this.state.conversationId ?? "",
        error_message: error instanceof Error ? error.message : String(error),
      });
    });

    this.send(buildConductingProgressPayload(nextState));

    const [refreshedLiveProfile, refreshedSampleProfile, refreshedRuntimeLayers] = await Promise.all([
      getActiveConductingProfile(this.state.survey!.id, "live"),
      getActiveConductingProfile(this.state.survey!.id, "sample"),
      getConductingRuntimeLayers({
        surveyId: this.state.survey!.id,
        classroomId: this.state.survey!.classroomId,
        programId: this.state.survey!.programId,
        language: this.state.language,
        mode: "live",
      }),
    ]);
    const refreshedPrompt = buildConductingSystemPrompt({
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: nextState,
      sessionType: "live",
      conductingProfile: refreshedLiveProfile?.profile ?? refreshedSampleProfile?.profile ?? null,
      expertGuidanceContext: refreshedRuntimeLayers.expertGuidanceContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: false,
      },
    });
    this.voiceAgent?.updateThink({
      provider: { type: "open_ai", model: VOICE_AGENT_THINK_MODEL },
      prompt: `${refreshedPrompt}\n\nRespond in the language the participant is speaking.`,
      functions: buildRespondentVoiceFunctions(
        false,
      ),
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
      case "finishSurvey": {
        if (!this.state.sessionState || !this.state.sessionId || !this.state.coveragePlan) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Session state not ready" }),
          );
          return;
        }

        const result = await resolveFinishSurveyRequest({
          sessionId: this.state.sessionId,
          sessionState: this.state.sessionState,
          coveragePlan: this.state.coveragePlan,
        });
        this.state.sessionState = result.nextState;

        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify(result.response),
        );

        if (!result.ok) {
          return;
        }

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

  protected async handleControlMessage(
    message: Record<string, unknown>,
  ): Promise<void> {
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

        if (this.state.survey?.id) {
          try {
            await scheduleAnalyticsRefresh({
              surveyId: this.state.survey.id,
              userId: this.ownerId || this.state.survey.userId,
            });
          } catch (error) {
            Sentry.logger.error("Survey response voice: failed to schedule completion analytics refresh", {
              service: "survey-response-voice",
              survey_id: this.state.survey?.id ?? "",
              conversation_id: this.state.conversationId ?? "",
              error_message: error instanceof Error ? error.message : String(error),
            });
          }
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
      Sentry.logger.error("Survey response voice: failed to complete voice survey", {
        service: "survey-response-voice",
        survey_id: this.state.survey?.id ?? "",
        conversation_id: this.state.conversationId ?? "",
        error_message: error instanceof Error ? error.message : String(error),
      });
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
      Sentry.logger.error("Survey response voice: cleanup failed", {
        service: "survey-response-voice",
        survey_id: this.state.survey?.id ?? "",
        conversation_id: this.state.conversationId ?? "",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

