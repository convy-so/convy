import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { sampleConversations, surveys, voiceSessions } from "@/db/schema";
import { type ChatMessage } from "@/lib/chat-types";
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
  getSessionBySourceId,
  purgeSessionAnalyticsArtifacts,
  updateSessionState,
} from "@/lib/education/storage";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import type {
  CoveragePlan,
  ResearchBrief,
  SessionState,
} from "@/lib/education/types";
import { buildSampleVoiceFunctions } from "@/lib/education/agent-tools";
import {
  buildVoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentSettings,
  VOICE_AGENT_THINK_MODEL,
} from "@/lib/voice/deepgram-voice-agent";
import { getSurveyPermissionContext } from "@/lib/survey-access";
import type { AuthenticatedConnection } from "../middleware/auth";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import {
  acquireSurveyLease,
  incrementSurveyRevision,
  releaseSurveyLease,
  renewSurveyLease,
} from "@/lib/collaboration-service";
import { isSupportedVoiceLocale, normalizeVoiceLocale } from "@/lib/voice/voice-locales";
import * as Sentry from "@sentry/node";

interface SampleState {
  surveyId: string;
  conversationId: string | null;
  conversationNumber: number;
  voiceSessionId: string;
  messages: ChatMessage[];
  survey: typeof surveys.$inferSelect | null;
  language: SupportedLanguage;
  brief: ResearchBrief | null;
  coveragePlan: CoveragePlan | null;
  sessionId: string | null;
  sessionState: SessionState | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatMessageRole(value: unknown): value is ChatMessage["role"] {
  return (
    value === "user" ||
    value === "assistant" ||
    value === "system" ||
    value === "tool"
  );
}

function normalizeStoredMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((message) => {
    if (!isRecord(message) || !isChatMessageRole(message.role)) {
      return [];
    }

    return [{
      id: typeof message.id === "string" ? message.id : nanoid(),
      role: message.role,
      content: typeof message.content === "string" ? message.content : "",
      timestamp:
        typeof message.timestamp === "string"
          ? message.timestamp
          : new Date().toISOString(),
    }];
  });
}

export class SampleSurveyVoiceHandler extends BaseVoiceAgentHandler {
  private state: SampleState;
  private sessionStartTime = Date.now();
  private leaseToken: string | null = null;

  constructor(
    connection: AuthenticatedConnection,
    surveyId: string,
    conversationNumber = 1,
  ) {
    super(connection.ws, `sample-${connection.userId}`, connection.userId);

    this.state = {
      surveyId,
      conversationId: null,
      conversationNumber,
      voiceSessionId: nanoid(),
      messages: [],
      survey: null,
      language: "en",
      brief: null,
      coveragePlan: null,
      sessionId: null,
      sessionState: null,
    };
  }

  async initialize(): Promise<void> {
    try {
      const [survey, briefRow, planRow] = await Promise.all([
        getDb().select().from(surveys).where(eq(surveys.id, this.state.surveyId)).then((rows) => rows[0]),
        getResearchBrief(this.state.surveyId),
        getActiveCoveragePlan(this.state.surveyId),
      ]);

      if (!survey) {
        this.sendError("Survey not found");
        this.ws.close();
        return;
      }

      const permission = await getSurveyPermissionContext(
        this.userId!,
        this.state.surveyId,
      );
      if (!permission?.canEdit) {
        this.sendError("Unauthorized");
        this.ws.close();
        return;
      }

      const lease = await acquireSurveyLease({
        surveyId: this.state.surveyId,
        stage: "rehearsal",
        userId: this.userId!,
        sessionId: this.state.voiceSessionId,
      });
      if (!lease.ok) {
        this.sendError("Another editor currently controls this rehearsal.");
        this.ws.close();
        return;
      }
      this.leaseToken = lease.lease.leaseToken;

      if (!briefRow || !planRow) {
        this.sendError("This survey is not ready for education interview rehearsal yet.");
        this.ws.close();
        return;
      }

      if (this.state.conversationNumber > survey.sampleConversationCount + 1) {
        this.sendError("Sample conversations must be sequential");
        this.ws.close();
        return;
      }

      this.state.survey = survey;
      this.state.language = isSupportedVoiceLocale(survey.language)
        ? survey.language
        : normalizeVoiceLocale(undefined);
      this.state.brief = briefRow.brief;
      this.state.coveragePlan = planRow.plan;
      this.surveyId = survey.id;

      await getDb().insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        userId: this.userId,
        sessionType: "sample_conversation",
        status: "active",
        startedAt: new Date(),
      });

      let sampleConversation = await getDb()
        .select()
        .from(sampleConversations)
        .where(
          and(
            eq(sampleConversations.surveyId, survey.id),
            eq(sampleConversations.conversationNumber, this.state.conversationNumber),
          ),
        )
        .then((rows) => rows[0]);

      if (!sampleConversation) {
        const [created] = await getDb()
          .insert(sampleConversations)
          .values({
            id: nanoid(),
            surveyId: survey.id,
            conversationNumber: this.state.conversationNumber,
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
              this.state.conversationNumber,
            ),
            updatedAt: new Date(),
          })
          .where(eq(surveys.id, survey.id));
      }

      this.state.conversationId = sampleConversation.id;
      this.state.messages = normalizeStoredMessages(sampleConversation.messages);

      let sessionRow = await getSessionBySourceId(sampleConversation.id);
      if (!sessionRow) {
        sessionRow = await ensureSession({
          surveyId: survey.id,
          sessionType: "sample",
          sourceConversationId: sampleConversation.id,
          language: this.state.language,
          initialState: createInitialSessionState({
            surveyId: survey.id,
            sessionId: nanoid(),
            sessionType: "sample",
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
        conversationId: this.state.conversationId,
        conversationNumber: this.state.conversationNumber,
      });

      await this.connectVoiceAgent();
    } catch (error) {
      Sentry.logger.error("Sample survey voice: failed to initialize voice session", {
        service: "sample-survey-voice",
        survey_id: this.state.surveyId,
        conversation_number: this.state.conversationNumber,
        error_message: error instanceof Error ? error.message : String(error),
      });
      this.sendError("Failed to initialize session");
      this.ws.close();
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected getInitialUserInput(): string | null {
    if (this.state.messages.length === 0) {
      return "Start the sample interview now. Greet the participant warmly and ask the first best question.";
    }

    const lastMessage = this.state.messages[this.state.messages.length - 1];
    if (lastMessage.role === "user") {
      return "The user is returning to a rehearsal session. Briefly welcome them back, acknowledge their last answer, and continue the interview naturally.";
    }

    return null;
  }

  protected isNewSession(): boolean {
    return this.state.messages.length === 0;
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    if (!this.state.survey || !this.state.brief || !this.state.coveragePlan || !this.state.sessionState) {
      throw new Error("Sample survey voice state is incomplete");
    }

    const [activeSampleProfile, runtimeLayers] = await Promise.all([
      getActiveConductingProfile(this.state.surveyId, "sample"),
      getConductingRuntimeLayers({
        surveyId: this.state.surveyId,
        classroomId: this.state.survey?.classroomId,
        programId: this.state.survey?.programId,
        language: this.state.language,
        mode: "sample",
      }),
    ]);

    const systemPrompt = `${buildConductingSystemPrompt({
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: this.state.sessionState,
      sessionType: "sample",
      conductingProfile: activeSampleProfile?.profile ?? null,
      expertGuidanceContext: runtimeLayers.expertGuidanceContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: false,
      },
    })}

Additional sample-session rules:
- Treat the creator exactly like a participant so they can feel the real interview flow.
- Honor the approved sample conducting profile precisely when it is present.
- Close naturally once the required education evidence is covered.
- Keep the exchange realistic and participant-centered.`;

    const tone = (this.state.survey.tone || "casual") as
      | "casual"
      | "formal"
      | "playful"
      | "empathetic";

    return buildVoiceAgentSettings({
      language: this.state.language,
      tone,
      systemPrompt,
      functions: buildSampleVoiceFunctions(
        false,
      ),
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
    const leaseOk = await this.ensureRehearsalLease();
    if (!leaseOk) {
      return;
    }

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
        id: nanoid(),
        role: event.role,
        content: event.content,
        timestamp: now.toISOString(),
      });
    }

    if (this.state.conversationId) {
      await getDb()
        .update(sampleConversations)
        .set({
          messages: this.state.messages.map(m => ({ ...m, id: m.id || nanoid() })),
          updatedAt: new Date(),
        })
        .where(eq(sampleConversations.id, this.state.conversationId));
      await incrementSurveyRevision(this.state.surveyId).catch((error) => {
        Sentry.logger.error("Sample survey voice: failed to increment survey revision", {
          service: "sample-survey-voice",
          survey_id: this.state.surveyId,
          conversation_id: this.state.conversationId ?? "",
          error_message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (
      event.role !== "assistant" ||
      !this.state.sessionId ||
      !this.state.sessionState ||
      !this.state.brief ||
      !this.state.coveragePlan ||
      !this.state.conversationId ||
      !this.state.messages.some((message) => message.role === "user")
    ) {
      return;
    }

    const { nextState } = await finalizeConductingTurn({
      surveyId: this.state.surveyId,
      sessionId: this.state.sessionId,
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: this.state.sessionState,
      messages: this.state.messages,
    });

    this.state.sessionState = nextState;
    await purgeSessionAnalyticsArtifacts({
      surveyId: this.state.surveyId,
      sessionId: this.state.sessionId,
    }).catch((error) => {
      Sentry.logger.error("Sample survey voice: failed to purge analytics artifacts", {
        service: "sample-survey-voice",
        survey_id: this.state.surveyId,
        session_id: this.state.sessionId ?? "",
        error_message: error instanceof Error ? error.message : String(error),
      });
    });

    this.send({
      type: "progress",
      completionPercentage: Math.round(nextState.overallCoverage * 100),
      state: nextState.status,
      shouldWrapUp: nextState.status === "completed",
    });

    const [refreshedSampleProfile, refreshedRuntimeLayers] = await Promise.all([
      getActiveConductingProfile(this.state.surveyId, "sample"),
      getConductingRuntimeLayers({
        surveyId: this.state.surveyId,
        classroomId: this.state.survey?.classroomId,
        programId: this.state.survey?.programId,
        language: this.state.language,
        mode: "sample",
      }),
    ]);
    const refreshedPrompt = `${buildConductingSystemPrompt({
      brief: this.state.brief,
      coveragePlan: this.state.coveragePlan,
      sessionState: nextState,
      sessionType: "sample",
      conductingProfile: refreshedSampleProfile?.profile ?? null,
      expertGuidanceContext: refreshedRuntimeLayers.expertGuidanceContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: false,
      },
    })}

Additional sample-session rules:
- Treat the creator exactly like a participant so they can feel the real interview flow.
- Close naturally once the required education evidence is covered.
- Keep the exchange realistic and participant-centered.`;

    this.voiceAgent?.updateThink({
      provider: { type: "open_ai", model: VOICE_AGENT_THINK_MODEL },
      prompt: `${refreshedPrompt}\n\nRespond in the language the participant is speaking.`,
      functions: buildSampleVoiceFunctions(
        false,
      ),
    });
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
          this.cleanup();
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

  protected async handleControlMessage(message: Record<string, unknown>): Promise<void> {
    if (message.type === "end_session") {
      await this.cleanup();
    }
  }

  protected async cleanup(): Promise<void> {
    await super.cleanup();

    if (this.leaseToken) {
      const releaseResult = await releaseSurveyLease({
        surveyId: this.state.surveyId,
        stage: "rehearsal",
        userId: this.userId!,
        leaseToken: this.leaseToken,
      }).catch((error) => {
        Sentry.logger.error("Sample survey voice: failed to release rehearsal lease", {
          service: "sample-survey-voice",
          survey_id: this.state.surveyId,
          error_message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (releaseResult?.ok) {
      }
      this.leaseToken = null;
    }

    if (!this.state.voiceSessionId) return;

    getDb()
      .update(voiceSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(voiceSessions.id, this.state.voiceSessionId))
      .catch(() => undefined);

    if (!this.state.conversationId) return;

    const sessionDurationMs = Date.now() - this.sessionStartTime;
    getDb()
      .update(sampleConversations)
      .set({
        durationMs: sessionDurationMs,
        activeDurationMs: Math.round(this.activeDurationMs),
      })
      .where(eq(sampleConversations.id, this.state.conversationId))
      .catch(() => undefined);
  }

  private async ensureRehearsalLease() {
    if (this.leaseToken) {
      const renewed = await renewSurveyLease({
        surveyId: this.state.surveyId,
        stage: "rehearsal",
        userId: this.userId!,
        leaseToken: this.leaseToken,
      });

      if (renewed.ok) {
        return true;
      }
    }

    const acquired = await acquireSurveyLease({
      surveyId: this.state.surveyId,
      stage: "rehearsal",
      userId: this.userId!,
      sessionId: this.state.voiceSessionId,
    });

    if (!acquired.ok) {
      this.sendError("Another editor currently controls this rehearsal.");
      return false;
    }

    this.leaseToken = acquired.lease.leaseToken;
    return true;
  }
}

