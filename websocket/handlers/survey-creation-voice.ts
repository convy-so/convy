import { db } from "@/db";
import {
  surveyCreationConversations,
  voiceSessions,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { AUDIO_CONFIG } from "@/lib/voice/audio-processing";
import {
  getGoogleSTTService,
  GoogleSTTStreamingSession,
} from "@/lib/voice/google-stt";
import { getTTSService } from "@/lib/voice/google-tts";
import {
  getSurveyCreationSystemPrompt,
  getSurveyDataExtractionPrompt,
  type CollectedInfo,
} from "@/lib/prompts";
import { defaultModel, analysisModel } from "@/lib/ai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AuthenticatedConnection } from "../middleware/auth";
import { BaseVoiceHandler } from "./base-voice-handler";
import { WebSocket } from "ws";

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
  language: "en" | "fr" | "de";
}

export class SurveyCreationVoiceHandler extends BaseVoiceHandler {
  private state: CreationState;

  constructor(connection: AuthenticatedConnection) {
    // Pass to base
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
        additionalContext: false,
        requiredQuestions: false,
        metrics: false,
        personalInfo: false,
        subjectDefined: false,
        domainIdentified: false,
      },
      isProcessing: false,
      language: "en",
    };
  }

  async initialize(): Promise<void> {
    try {
      // Create voice session
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        userId: this.userId,
        // @ts-ignore - sessionType "survey_creation" might be missing from schema enum in some versions but valid in DB
        sessionType: "survey_creation", 
        status: "active",
        startedAt: new Date(),
      });

      this.initializeSTTSession();
      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
      });

      // Send initial greeting if no messages yet
      if (this.state.messages.length === 0) {
        const greeting = "Hi! I'm here to help you create the perfect survey. Let's start with the basics - what's the main objective of your survey? What do you want to learn from your respondents?";
        await this.sendAssistantResponse(greeting);
      }
    } catch (error) {
      console.error("[Survey Creation Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
    }
  }

  protected getLanguage(): "en" | "fr" | "de" {
    return this.state.language;
  }

  protected async handleControlMessage(message: any): Promise<void> {
    await super.handleControlMessage(message);

    switch (message.type) {
      case "set_survey_id":
        this.state.surveyId = message.surveyId;
        await this.loadExistingState();
        break;
      case "text_message":
        if (message.text) {
          await this.processTextMessage(message.text);
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

    if (conv) {
      this.state.messages = (conv.messages as any[]) || [];
      this.state.collectedInfo = conv.collectedInfo as CollectedInfo;
      
      // Update voice session with surveyId
      await db.update(voiceSessions)
        .set({ surveyId: this.state.surveyId })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));
    }
  }

  // Override to perform extraction in background
  async processUserMessage(text: string): Promise<void> {
     await this.processTextMessage(text);
  }

  private async processTextMessage(text: string): Promise<void> {
    this.state.isProcessing = true;
    try {
      // Add user message
      const userMsg = {
        role: "user" as const,
        content: text,
        timestamp: new Date().toISOString(),
      };
      this.state.messages.push(userMsg);

      // Save to DB if surveyId exists
      await this.saveConversation();

      // Generate AI response
      const systemPrompt = getSurveyCreationSystemPrompt(this.state.collectedInfo, this.state.language);
      
      const { text: responseText } = await generateText({
        model: defaultModel,
        system: systemPrompt,
        messages: this.state.messages.map(m => ({ role: m.role, content: m.content })),
      });

      await this.sendAssistantResponse(responseText);
      
      // Perform extraction in background
      this.performExtraction().catch(console.error);

    } catch (error) {
      console.error("[Survey Creation Voice] Processing error:", error);
      this.sendError("Sorry, I had trouble processing that.");
    } finally {
      this.state.isProcessing = false;
    }
  }

  private async sendAssistantResponse(text: string): Promise<void> {
    const assistantMsg = {
      role: "assistant" as const,
      content: text,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(assistantMsg);
    await this.saveConversation();

    // Synthesize audio
    try {
      const synthesis = await this.tts.synthesizeForSurvey(text, "casual", this.state.language);
      if ("audio" in synthesis) {
        this.ws.send(synthesis.audio);
        this.send({
          type: "audio_sent",
          text,
          durationMs: synthesis.duration,
        });
      } else {
        this.send({ type: "text_response", text });
      }
    } catch (error) {
      this.send({ type: "text_response", text });
    }
  }

  private async saveConversation(): Promise<void> {
    if (!this.state.surveyId) return;

    await db.update(surveyCreationConversations)
      .set({ 
        messages: this.state.messages,
        status: "in_progress"
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
            additionalContext: z.any().nullable(),
            requiredQuestions: z.any().nullable(),
            metrics: z.any().nullable(),
            personalInfo: z.any().nullable(),
            domainId: z.any().nullable(),
            isVoice: z.boolean().nullable(),
            title: z.any().nullable(),
            collectedInfo: z.any(),
          }) as any
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
      .catch(console.error); // Fire and forget
  }
}
