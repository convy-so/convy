import { db } from "@/db";
import {
  surveys,
  sampleConversations,
  voiceSessions,
} from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  type SurveyConfig,
} from "@/lib/prompts";
import { defaultModel } from "@/lib/ai";
import { generateText, stepCountIs } from "ai";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import {
  type RollingContext,
} from "@/lib/conversation-memory";
import type { AuthenticatedConnection } from "../middleware/auth";
import { BaseVoiceHandler } from "./base-voice-handler";
import { ConversationManager } from "@/lib/conversation-manager";

interface SampleState {
  surveyId: string;
  conversationId: string | null;
  conversationNumber: number;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  survey: typeof surveys.$inferSelect | null;
  language: typeof surveys.$inferSelect.language;
  context: RollingContext | null;
  surveyConfig: SurveyConfig | null;
}

export class SampleSurveyVoiceHandler extends BaseVoiceHandler {
  private state: SampleState;
  private sessionStartTime: number = Date.now();

  constructor(connection: AuthenticatedConnection, surveyId: string, conversationNumber: number = 1) {
    // Pass connection details to base class
    super(connection.ws, `sample-${connection.userId}`, connection.userId);
    
    this.state = {
      surveyId,
      conversationId: null,
      conversationNumber,
      voiceSessionId: nanoid(),
      messages: [],
      survey: null,
      language: "en",
      context: null,
      surveyConfig: null,
    };
  }

  async initialize(): Promise<void> {
    try {
      const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, this.state.surveyId));

      if (!survey) {
        this.sendError("Survey not found");
        this.ws.close();
        return;
      }

      if (survey.userId !== this.userId) {
        this.sendError("Unauthorized");
        this.ws.close();
        return;
      }

      if (this.state.conversationNumber > survey.sampleConversationCount + 1) {
        this.sendError("Sample conversations must be sequential");
        return;
      }

      this.state.survey = survey;
      this.state.language = survey.language;
      this.state.surveyConfig = buildCompleteSurveyConfig(survey);

      // Deterministic ID for context persistence during this sample session (handles reconnects)
      const contextId = `sample:${this.state.surveyId}:${this.state.conversationNumber}:${this.userId}`;

      // Load or create rolling context using Manager
      this.state.context = await ConversationManager.loadOrCreateContext(
        contextId,
        [], 
        this.state.surveyConfig
      );

      // Create voice session in database
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        userId: this.userId,
        sessionType: "sample_conversation",
        status: "active",
        startedAt: new Date(),
      });

      // Check if sample conversation already exists for this survey + conversation number
      const existingConversation = await db
        .select()
        .from(sampleConversations)
        .where(
          and(
            eq(sampleConversations.surveyId, survey.id),
            eq(sampleConversations.conversationNumber, this.state.conversationNumber)
          )
        )
        .limit(1);

      let conversationId: string;
      
      if (existingConversation.length > 0) {
        // Conversation already exists - reuse it (e.g., reconnecting to same session)
        conversationId = existingConversation[0].id;
        console.log(`[Sample Survey Voice] Reusing existing conversation ${conversationId} for survey ${survey.id}, conversation #${this.state.conversationNumber}`);
      } else {
        // Create new sample conversation record
        conversationId = nanoid();
        await db.insert(sampleConversations).values({
          id: conversationId,
          surveyId: survey.id,
          conversationNumber: this.state.conversationNumber,
          messages: [],
          confirmed: false,
        });
        console.log(`[Sample Survey Voice] Created new conversation ${conversationId} for survey ${survey.id}, conversation #${this.state.conversationNumber}`);
      }

      this.state.conversationId = conversationId;

      // Initialize STT via base class
      this.initializeSTTSession();
      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId: this.state.conversationId,
        conversationNumber: this.state.conversationNumber,
      });

      // Generate and send initial greeting automatically
      await this.generateInitialGreeting();

    } catch (error) {
      console.error("[Sample Survey Voice] Initialization error:", error);
      this.sendError("Failed to initialize session");
    }
  }

  protected getLanguage(): typeof surveys.$inferSelect.language {
    return this.state.language;
  }

  protected async handleControlMessage(message: any): Promise<void> {
    // Handle base messages (ping)
    await super.handleControlMessage(message);

    if (message.type === "end_session") {
       await this.cleanup();
    }
  }

  /**
   * Generate and send initial greeting to start the conversation
   */
  private async generateInitialGreeting(): Promise<void> {
    try {
      if (!this.state.surveyConfig) return;

      const contextId = `sample:${this.state.surveyId}:${this.state.conversationNumber}:${this.userId}`;

      // Get previous feedback for rehearsal
      const previousFeedbackRows = await db
        .select({ feedback: sampleConversations.feedback, finalComments: sampleConversations.finalComments })
        .from(sampleConversations)
        .where(
            and(
                eq(sampleConversations.surveyId, this.state.surveyId), 
                lt(sampleConversations.conversationNumber, this.state.conversationNumber)
            )
        );
      
      const combinedFeedback = previousFeedbackRows
        .flatMap(r => [r.feedback, r.finalComments])
        .filter(Boolean)
        .join("\n\n");

      // Get system prompt for initial greeting
      const systemPrompt = ConversationManager.getSystemPrompt(
        this.state.surveyConfig,
        this.state.context!,
        {
            isSample: true,
            sampleFeedback: combinedFeedback || undefined,
            conversationNumber: this.state.conversationNumber,
            language: this.state.language
        }
      );

      // Get tools from Manager
      const tools = ConversationManager.getTools(
          this.state.surveyConfig, 
          (media) => {
             this.send({ type: "display_media", media });
          }
      );

      console.log(`[Sample Survey Voice] Generating initial greeting. System prompt length: ${systemPrompt.length}`);

      // Generate greeting with empty message history
      // Note: We provide a hidden user trigger message because some providers/models require at least one message
      const { text: greetingText } = await generateText({
        model: defaultModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Start the conversation now.' }],
        tools,
        stopWhen: stepCountIs(5),
      });

      // Add greeting to conversation history
      this.state.messages.push({
        role: "assistant",
        content: greetingText,
        timestamp: new Date().toISOString(),
      });

      // Save to database
      if (this.state.conversationId) {
        await db.update(sampleConversations)
          .set({ messages: this.state.messages.map(m => ({ role: m.role, content: m.content })) })
          .where(eq(sampleConversations.id, this.state.conversationId));
      }

      // Update context with greeting
      this.state.context = await ConversationManager.loadOrCreateContext(
        contextId,
        this.state.messages.map(m => ({ role: m.role, content: m.content })),
        this.state.surveyConfig
      );

      // Save context
      await ConversationManager.saveContext(contextId, this.state.context!);

      // Synthesize and send audio
      await this.synthesizeAndSendAudio(greetingText);
    } catch (error) {
      console.error("[Sample Survey Voice] Initial greeting error:", error);
      this.sendError("Failed to generate greeting");
    }
  }

  async processUserMessage(text: string): Promise<void> {
    // Accumulate user message
    this.state.messages.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    await this.generateResponse();
  }

  private async generateResponse(): Promise<void> {
    try {
      if (!this.state.surveyConfig) return;

      // Deterministic ID for context
      const contextId = `sample:${this.state.surveyId}:${this.state.conversationNumber}:${this.userId}`;

      // Update context using Manager (Handles compression, signals, etc.)
      // We pass the full history so the Manager can rebuild/compress correctly
      this.state.context = await ConversationManager.loadOrCreateContext(
        contextId,
        this.state.messages.map(m => ({ role: m.role, content: m.content })),
        this.state.surveyConfig
      );

      // Get previous feedback for rehearsal
      const previousFeedbackRows = await db
        .select({ feedback: sampleConversations.feedback, finalComments: sampleConversations.finalComments })
        .from(sampleConversations)
        .where(
            and(
                eq(sampleConversations.surveyId, this.state.surveyId), 
                lt(sampleConversations.conversationNumber, this.state.conversationNumber)
            )
        );
      
      const combinedFeedback = previousFeedbackRows
        .flatMap(r => [r.feedback, r.finalComments])
        .filter(Boolean)
        .join("\n\n");

      // Get prompt from Manager
      const systemPrompt = ConversationManager.getSystemPrompt(
        this.state.surveyConfig,
        this.state.context!,
        {
            isSample: true,
            sampleFeedback: combinedFeedback || undefined,
            conversationNumber: this.state.conversationNumber,
            language: this.state.language
        }
      );

      // Get tools from Manager
      const tools = ConversationManager.getTools(
          this.state.surveyConfig, 
          (media) => {
             this.send({ type: "display_media", media });
          }
      );

      const { text: responseText } = await generateText({
        model: defaultModel,
        system: systemPrompt,
        messages: this.state.messages.map(m => ({ role: m.role, content: m.content })),
        tools,
        stopWhen: stepCountIs(5),
      });

      this.state.messages.push({
        role: "assistant",
        content: responseText,
        timestamp: new Date().toISOString(),
      });

      if (this.state.conversationId) {
        await db.update(sampleConversations)
          .set({ messages: this.state.messages.map(m => ({ role: m.role, content: m.content })) })
          .where(eq(sampleConversations.id, this.state.conversationId));
      }

      // Trigger async memory update (non-blocking) using Manager
      ConversationManager.updateMemoryAsync(contextId, this.state.messages, this.state.surveyConfig, this.state.context!).catch(
        console.error
      );

      // Save updated context to Redis using Manager
      await ConversationManager.saveContext(contextId, this.state.context!);

      await this.synthesizeAndSendAudio(responseText);
    } catch (error) {
      console.error("[Sample Survey Voice] Response error:", error);
      this.sendError("Failed to generate response");
    }
  }

  private async synthesizeAndSendAudio(text: string): Promise<void> {
    try {
      const tone = this.state.survey?.tone || "casual";
      const synthesis = await this.tts.synthesizeForSurvey(text, tone, this.state.language);
      
      if ("audio" in synthesis) {
        this.ws.send(synthesis.audio);
        this.send({ 
          type: "audio_sent", 
          durationMs: synthesis.duration,
          text: text
        });

        // Update active duration tracking
        this.activeDurationMs += synthesis.duration;
        this.lastInteractionEndTime = Date.now() + synthesis.duration;
      } else {
        this.send({ type: "text_response", text });
      }
    } catch (error) {
      this.send({ type: "text_response", text });
    }
  }

  protected async cleanup(): Promise<void> {
    await super.cleanup();
    
    // Update DB status
    if (this.state.voiceSessionId) {
        db.update(voiceSessions)
        .set({ status: "completed", endedAt: new Date() })
        .where(eq(voiceSessions.id, this.state.voiceSessionId))
        .catch(console.error);

        // Update sample conversation with duration metrics
        if (this.state.conversationId) {
            const sessionDurationMs = Date.now() - this.sessionStartTime;
            
            db.update(sampleConversations)
            .set({ 
                durationMs: sessionDurationMs,
                activeDurationMs: Math.round(this.activeDurationMs)
            })
            .where(eq(sampleConversations.id, this.state.conversationId))
            .catch(console.error);
        }
    }
  }
}

