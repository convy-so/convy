import { db } from "@/db";
import {
  surveyCreationConversations,
  voiceSessions,
  surveys,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import {
  getSurveyCreationSystemPrompt,
  getSurveyDataExtractionPrompt,
  type CollectedInfo,
} from "@/lib/prompts";
import { getTimeBasedGreeting } from "@/lib/greetings";
import { analysisModel } from "@/lib/ai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AuthenticatedConnection } from "../middleware/auth";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import {
  buildVoiceAgentSettings,
  type VoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
} from "@/lib/voice/deepgram-voice-agent";

interface CreationState {
  surveyId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  collectedInfo: CollectedInfo;
  isProcessing: boolean;
  language: SupportedLanguage;
  extractedData: any;
}

export class SurveyCreationVoiceHandler extends BaseVoiceAgentHandler {
  private state: CreationState;
  private sessionStartTime: number = Date.now();

  constructor(connection: AuthenticatedConnection) {
    super(connection.ws, `creation-${connection.userId}`, connection.userId);

    this.state = {
      surveyId: null,
      voiceSessionId: nanoid(),
      messages: [],
      collectedInfo: {
        objective: false,
        targetAudience: false,
        scope: false,
        successCriteria: false,
        constraints: false,
        hypotheses: false,
        tone: false,
        requiredQuestions: false,
        metrics: false,
        personalInfo: false,
        subjectDefined: false,
        domainIdentified: false,
      },
      isProcessing: false,
      language: "en",
      extractedData: null as any,
    };
  }

  async initialize(): Promise<void> {
    try {
      // Start DB insert in background
      const dbInsertPromise = db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        userId: this.userId,
        sessionType: "survey_creation",
        status: "active",
        startedAt: new Date(),
      });

      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
      });

      // Voice Agent connection is deferred until start_conversation
      // (to allow set_survey_id and set_language to be called first)

      await dbInsertPromise;
    } catch (error) {
      console.error("[Survey Creation Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    const systemPrompt = getSurveyCreationSystemPrompt(
      this.state.collectedInfo,
      this.state.language,
      this.state.extractedData?.domainId as number | undefined
    );

    return buildVoiceAgentSettings({
      language: this.state.language,
      systemPrompt,
      greeting: getTimeBasedGreeting('creation', this.state.language),
      conversationHistory: this.state.messages.length > 0
        ? this.state.messages.map(m => ({ role: m.role, content: m.content }))
        : undefined,
    });
  }

  protected async onConversationText(event: ConversationTextEvent): Promise<void> {
    // Add to conversation history
    this.state.messages.push({
      role: event.role,
      content: event.content,
      timestamp: new Date().toISOString(),
    });

    await this.saveConversation();

    // Trigger extraction after assistant messages
    if (event.role === "assistant") {
      this.performExtraction().catch(console.error);
    }
  }

  protected async onFunctionCall(event: FunctionCallRequestEvent): Promise<void> {
    // Survey creation doesn't use function calling
    // Respond with a no-op to not block the agent
    this.voiceAgent?.sendFunctionCallResponse(
      event.function_call_id,
      JSON.stringify({ status: "ok" })
    );
  }

  protected async handleControlMessage(message: any): Promise<void> {
    switch (message.type) {
      case "set_survey_id":
        this.state.surveyId = message.surveyId;
        await this.loadExistingState();
        break;

      case "update_collected_info":
        if (message.collectedInfo) {
          this.state.collectedInfo = { ...this.state.collectedInfo, ...message.collectedInfo };
        }
        break;

      case "start_conversation":
        console.log(`[Survey Creation Voice] Starting conversation. History length: ${this.state.messages.length}`);
        // Connect the Voice Agent (with greeting if new session)
        await this.connectVoiceAgent();
        break;

      case "text_message":
        if (message.text) {
          if (this.voiceAgent?.connected) {
            this.voiceAgent.sendInjectUserMessage(message.text);
          }
        }
        break;

      case "set_language":
        if (message.language && ["en", "fr", "de", "es", "it"].includes(message.language)) {
          this.state.language = message.language;
          if (this.state.surveyId) {
            await db.update(surveys)
              .set({ language: message.language })
              .where(eq(surveys.id, this.state.surveyId));
          }
          // Reconnect Voice Agent with new language if already connected
          if (this.voiceAgent?.connected) {
            await this.reconnectVoiceAgent();
          }
        }
        break;
    }
  }

  private async loadExistingState(): Promise<void> {
    if (!this.state.surveyId) return;

    const [conv] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));

    // Also fetch the survey to get the language
    const [survey] = await db
      .select({ language: surveys.language })
      .from(surveys)
      .where(eq(surveys.id, this.state.surveyId));

    if (survey && ["en", "fr", "de", "es", "it"].includes(survey.language)) {
      this.state.language = survey.language as SupportedLanguage;
    }

    if (conv) {
      this.state.messages = (conv.messages as any[]) || [];
      this.state.collectedInfo = conv.collectedInfo as CollectedInfo;
      this.state.extractedData = conv.extractedData || null;

      // Update voice session with surveyId
      await db.update(voiceSessions)
        .set({ surveyId: this.state.surveyId })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));
    }
  }

  private async saveConversation(): Promise<void> {
    if (!this.state.surveyId) return;

    await db.update(surveyCreationConversations)
      .set({
        messages: this.state.messages,
        status: "in_progress",
      })
      .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));
  }

  private async performExtraction(): Promise<void> {
    if (!this.state.surveyId || this.state.messages.length < 2) return;

    try {
      const extractionPrompt = getSurveyDataExtractionPrompt(this.state.messages);

      const { output: parsed } = await generateText({
        model: analysisModel,
        output: Output.object({
          schema: z.object({
            objective: z.any().nullable(),
            targetAudience: z.any().nullable(),
            scope: z.any().nullable(),
            successCriteria: z.any().nullable(),
            constraints: z.any().nullable(),
            hypotheses: z.any().nullable(),
            tone: z.any().nullable(),
            requiredQuestions: z.any().nullable(),
            metrics: z.any().nullable(),
            personalInfo: z.any().nullable(),
            domainId: z.any().nullable(),
            isVoice: z.boolean().nullable(),
            title: z.any().nullable(),
            collectedInfo: z.any(),
          }) as any,
        }),
        prompt: extractionPrompt,
      });

      const { collectedInfo, ...extractedData } = parsed as any;

      this.state.collectedInfo = collectedInfo;

      await db.update(surveyCreationConversations)
        .set({
          extractedData: extractedData,
          collectedInfo: collectedInfo,
        })
        .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));

      this.send({
        type: "update_extracted_data",
        extractedData,
        collectedInfo,
      });
    } catch (error) {
      console.error("[Survey Creation Voice] Extraction error:", error);
    }
  }

  protected async cleanup(): Promise<void> {
    await super.cleanup();

    db.update(voiceSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(voiceSessions.id, this.state.voiceSessionId))
      .catch(console.error);

    // Update creation conversation with duration metrics
    if (this.state.surveyId) {
      const sessionDurationMs = Date.now() - this.sessionStartTime;

      await db.update(surveyCreationConversations)
        .set({
          durationMs: sessionDurationMs,
          activeDurationMs: Math.round(this.activeDurationMs),
        })
        .where(eq(surveyCreationConversations.surveyId, this.state.surveyId))
        .catch(console.error);
    }
  }
}
