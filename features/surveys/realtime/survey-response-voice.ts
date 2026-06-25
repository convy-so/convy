import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { WebSocket } from "ws";

import { getDb } from "@/shared/db";
import { surveyConversations, surveys, voiceSessions } from "@/shared/db/schema";
import {
  buildConductingSystemPrompt,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/features/surveys/server/education/conducting-runtime";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/shared/chat/chat-ui-messages";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
} from "@/features/surveys/server/education/storage";
import { getConductingRuntimeLayers } from "@/features/surveys/server/education/runtime-context";
import { scheduleAnalyticsRefresh } from "@/features/surveys/server/analytics/analytics-refresh-scheduler";
import { buildRespondentVoiceFunctions } from "@/features/surveys/server/education/agent-tools";
import {
  buildVoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentSettings,
  VOICE_AGENT_THINK_MODEL,
} from "@/features/surveys/voice/deepgram-voice-agent";
import {
  admitParticipantOnFirstUserTurn,
  buildRespondentVoiceGreeting,
  buildVoiceAgentKeyterms,
  getUsableRespondentMessages,
  hasUserTurn,
} from "@/features/surveys/server/respondent-conversation";
import { normalizeVoiceLocale } from "@/features/surveys/voice/voice-locales";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import {
  appendConversationText,
  buildConductingProgressPayload,
  resolveFinishSurveyRequest,
} from "./survey-voice-shared";
import {
  createBootingVoiceState,
  createClosedVoiceState,
  createReadyVoiceState,
  requireReadyVoiceState,
  type SurveyResponseVoiceReadyState,
  type SurveyResponseVoiceState,
} from "./survey-response-voice-state";
import * as Sentry from "@sentry/node";
import {
  SURVEY_SESSION_TYPE,
  VOICE_SESSION_STATUS,
  VOICE_SESSION_TYPE,
  normalizeSurveyTone,
} from "@/shared/surveys/constants";
import { requireValue } from "@/shared/utils/collections";

const SURVEY_RESPONSE_VOICE_COST = {
  estimatedSpeechToTextCostPerMinute: 0.0059,
  estimatedTextToSpeechCostPerCharacter: 0.000015,
} as const;

const SURVEY_RESPONSE_VOICE_DELAY_MS = {
  completionSignal: 1200,
  finishFunction: 500,
} as const;

export class SurveyResponseVoiceHandler extends BaseVoiceAgentHandler {
  private state: SurveyResponseVoiceState;
  private sessionStartTime = Date.now();
  private cleanupStarted = false;
  private hasExplicitLanguage: boolean;

  constructor(
    ws: WebSocket,
    surveyId: string,
    conversationId: string,
    identifier: string,
    language?: string,
  ) {
    super(ws, identifier);

    this.hasExplicitLanguage = typeof language === "string" && language.length > 0;
    this.state = createBootingVoiceState({
      surveyLookupKey: surveyId,
      conversationId,
      voiceSessionId: nanoid(),
      language: normalizeVoiceLocale(language),
    });
  }

  private getReadyState(): SurveyResponseVoiceReadyState | null {
    return this.state.phase === "ready" ? this.state : null;
  }

  async initialize(): Promise<void> {
    try {
      const bootState = this.state;
      if (bootState.phase !== "booting") {
        throw new Error("Survey response voice initialized from an invalid phase");
      }

      const survey = await getDb()
        .select()
        .from(surveys)
        .where(eq(surveys.shareableLink, bootState.surveyLookupKey))
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

      this.surveyId = survey.id;
      const resolvedLanguage = this.hasExplicitLanguage
        ? bootState.language
        : normalizeVoiceLocale(survey.language);

      const conversation = await getDb()
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.id, bootState.conversationId))
        .then((rows) => rows[0]);

      if (!conversation || conversation.surveyId !== survey.id) {
        this.sendError("Conversation not found");
        this.ws.close();
        return;
      }

      const participantId = conversation.participantId || nanoid(8);
      const messages = getUsableRespondentMessages(
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
          .set({ participantId, updatedAt: new Date() })
          .where(eq(surveyConversations.id, conversation.id));
      }

      await getDb().insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        conversationId: conversation.id,
        sessionType: VOICE_SESSION_TYPE.SURVEY_RESPONSE,
        status: VOICE_SESSION_STATUS.ACTIVE,
        startedAt: new Date(),
      });

      let sessionRow = await getSessionBySourceId(conversation.id);
      if (!sessionRow) {
        sessionRow = await ensureSession({
          surveyId: survey.id,
          sessionType: SURVEY_SESSION_TYPE.LIVE,
          sourceConversationId: conversation.id,
          language: resolvedLanguage,
          respondentId: participantId,
          initialState: createInitialSessionState({
            surveyId: survey.id,
            sessionId: nanoid(),
            sessionType: SURVEY_SESSION_TYPE.LIVE,
            language: resolvedLanguage,
            coveragePlan: planRow.plan,
          }),
        });
      }
      const readySessionRow = requireValue(
        sessionRow,
        `Failed to resolve live survey session for conversation ${conversation.id}`,
      );

      this.state = createReadyVoiceState({
        survey,
        conversationId: conversation.id,
        voiceSessionId: bootState.voiceSessionId,
        participantId,
        messages,
        language: resolvedLanguage,
        brief: briefRow.brief,
        coveragePlan: planRow.plan,
        sessionId: readySessionRow.id,
        sessionState: readySessionRow.sessionState,
        ownerId: survey.userId,
      });
      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: bootState.voiceSessionId,
        conversationId: conversation.id,
        language: resolvedLanguage,
      });

      await this.connectVoiceAgent();
    } catch (error) {
      Sentry.logger.error("Survey response voice: failed to initialize voice session", {
        service: "survey-response-voice",
        survey_id: this.state.phase === "ready" ? this.state.surveyId : null,
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

    const lastMessage = requireValue(
      this.state.messages[this.state.messages.length - 1],
      "Survey response voice expected a last message when messages are present",
    );
    if (lastMessage.role === "user") {
      return "The participant is resuming the interview. Briefly welcome them back, acknowledge their last answer, and continue naturally.";
    }

    return null;
  }

  protected isNewSession(): boolean {
    return this.state.messages.length === 0;
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    const state = requireReadyVoiceState(this.state);

    const [activeLiveProfile, sampleFallbackProfile, runtimeLayers] = await Promise.all([
      getActiveConductingProfile(state.survey.id, "live"),
      getActiveConductingProfile(state.survey.id, "sample"),
      getConductingRuntimeLayers({
        surveyId: state.survey.id,
        classroomId: state.survey.classroomId,
        programId: state.survey.programId,
        language: state.language,
        mode: "live",
      }),
    ]);
    const systemPrompt = buildConductingSystemPrompt({
      brief: state.brief,
      coveragePlan: state.coveragePlan,
      sessionState: state.sessionState,
      sessionType: "live",
      conductingProfile: activeLiveProfile?.profile ?? sampleFallbackProfile?.profile ?? null,
      expertGuidanceContext: runtimeLayers.expertGuidanceContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: false,
      },
    });

    return buildVoiceAgentSettings({
      language: state.language,
      tone: normalizeSurveyTone(state.survey.tone),
      systemPrompt,
      functions: buildRespondentVoiceFunctions(
        false,
      ),
      keyterms: buildVoiceAgentKeyterms({
        surveyTitle: state.survey.title,
        requiredQuestions: state.survey.requiredQuestions,
        media: [],
        brief: state.brief,
      }),
      greeting:
        state.messages.length === 0
          ? buildRespondentVoiceGreeting({
              language: state.language,
              surveyTitle: state.survey.title,
              brief: state.brief,
            })
          : undefined,
      conversationHistory:
        state.messages.length > 0
          ? state.messages.map((message) => ({
              role: message.role,
              content: message.content,
            }))
          : undefined,
    });
  }

  protected async onConversationText(event: ConversationTextEvent): Promise<void> {
    appendConversationText(this.state.messages, event);
    const state = this.getReadyState();
    if (!state) {
      return;
    }

    if (event.role === "user") {
      const admission = await admitParticipantOnFirstUserTurn({
        surveyId: state.survey.id,
        conversationId: state.conversationId,
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
        rawConversation: state.messages,
        updatedAt: new Date(),
      })
      .where(eq(surveyConversations.id, state.conversationId));

    if (
      event.role !== "assistant" ||
      !hasUserTurn(state.messages)
    ) {
      return;
    }

    const { nextState } = await finalizeConductingTurn({
      surveyId: state.survey.id,
      sessionId: state.sessionId,
      brief: state.brief,
      coveragePlan: state.coveragePlan,
      sessionState: state.sessionState,
      messages: state.messages.map((m) => ({
        ...m,
        id: m.id || nanoid(),
        timestamp: m.timestamp || new Date().toISOString(),
      })),
    });

    state.sessionState = nextState;
    await scheduleAnalyticsRefresh({
      surveyId: state.survey.id,
      userId: state.ownerId || state.survey.userId,
    }).catch((error) => {
      Sentry.logger.error("Survey response voice: failed to schedule analytics refresh", {
        service: "survey-response-voice",
        survey_id: state.survey.id,
        conversation_id: state.conversationId,
        error_message: error instanceof Error ? error.message : String(error),
      });
    });

    this.send(buildConductingProgressPayload(nextState));

    const [refreshedLiveProfile, refreshedSampleProfile, refreshedRuntimeLayers] = await Promise.all([
      getActiveConductingProfile(state.survey.id, "live"),
      getActiveConductingProfile(state.survey.id, "sample"),
      getConductingRuntimeLayers({
        surveyId: state.survey.id,
        classroomId: state.survey.classroomId,
        programId: state.survey.programId,
        language: state.language,
        mode: "live",
      }),
    ]);
    const refreshedPrompt = buildConductingSystemPrompt({
      brief: state.brief,
      coveragePlan: state.coveragePlan,
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
          void this.handleComplete();
        }, SURVEY_RESPONSE_VOICE_DELAY_MS.completionSignal);
      }
  }

  protected async onFunctionCall(event: FunctionCallRequestEvent): Promise<void> {
    const state = this.getReadyState();

    switch (event.function_name) {
      case "finishSurvey": {
        if (!state) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Session state not ready" }),
          );
          return;
        }

        const result = await resolveFinishSurveyRequest({
          sessionId: state.sessionId,
          sessionState: state.sessionState,
          coveragePlan: state.coveragePlan,
        });
        state.sessionState = result.nextState;

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
          void this.handleComplete();
        }, SURVEY_RESPONSE_VOICE_DELAY_MS.finishFunction);
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
      const state = this.getReadyState();
      if (state) {
        await getDb()
          .update(surveyConversations)
          .set({ completed: true, updatedAt: new Date() })
          .where(eq(surveyConversations.id, state.conversationId));

        if (state.survey.id) {
          try {
            await scheduleAnalyticsRefresh({
              surveyId: state.survey.id,
              userId: state.ownerId || state.survey.userId,
            });
          } catch (error) {
            Sentry.logger.error("Survey response voice: failed to schedule completion analytics refresh", {
              service: "survey-response-voice",
              survey_id: state.survey.id,
              conversation_id: state.conversationId,
              error_message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const sessionDurationMs = Date.now() - this.sessionStartTime;
      const durationMinutes = sessionDurationMs / 60000;
      const estimatedSttCost =
        durationMinutes *
        SURVEY_RESPONSE_VOICE_COST.estimatedSpeechToTextCostPerMinute;
      const totalAssistantChars = this.state.messages
        .filter((message) => message.role === "assistant")
        .reduce((sum, message) => sum + message.content.length, 0);
      const estimatedTtsCost =
        totalAssistantChars *
        SURVEY_RESPONSE_VOICE_COST.estimatedTextToSpeechCostPerCharacter;
      const totalCost = estimatedSttCost + estimatedTtsCost;

      await getDb()
        .update(voiceSessions)
        .set({
          status: VOICE_SESSION_STATUS.COMPLETED,
          endedAt: new Date(),
          durationMs: sessionDurationMs,
          audioDurationMs: Math.round(this.activeDurationMs),
          totalCost: totalCost.toString(),
          sttCost: estimatedSttCost.toString(),
          ttsCost: estimatedTtsCost.toString(),
        })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      if (state) {
        await getDb()
          .update(surveyConversations)
          .set({
            durationMs: sessionDurationMs,
            activeDurationMs: Math.round(this.activeDurationMs),
          })
          .where(eq(surveyConversations.id, state.conversationId));
      }

      this.send({
        type: "completed",
        conversationId: this.state.conversationId,
      });
      this.ws.close();
    } catch (error) {
      Sentry.logger.error("Survey response voice: failed to complete voice survey", {
        service: "survey-response-voice",
        survey_id: this.state.phase === "ready" ? this.state.surveyId : "",
        conversation_id: this.state.conversationId,
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

      const newStatus =
        session.status === VOICE_SESSION_STATUS.ACTIVE
          ? VOICE_SESSION_STATUS.ABANDONED
          : session.status;
      const durationMinutes = sessionDurationMs / 60000;
      const estimatedSttCost =
        durationMinutes *
        SURVEY_RESPONSE_VOICE_COST.estimatedSpeechToTextCostPerMinute;
      const totalAssistantChars = this.state.messages
        .filter((message) => message.role === "assistant")
        .reduce((sum, message) => sum + message.content.length, 0);
      const estimatedTtsCost =
        totalAssistantChars *
        SURVEY_RESPONSE_VOICE_COST.estimatedTextToSpeechCostPerCharacter;
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

      if (this.state.phase === "ready") {
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
        survey_id: this.state.phase === "ready" ? this.state.surveyId : "",
        conversation_id: this.state.conversationId,
        error_message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.state = createClosedVoiceState(this.state);
    }
  }
}

