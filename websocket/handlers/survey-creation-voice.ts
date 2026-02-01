import { db } from "@/db";
import {
  surveyCreationConversations,
  voiceSessions,
  surveys,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getCachedGreeting, getGreetingText, GREETING_TEXTS } from "@/lib/voice/google-tts";
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
  extractedData: any;
}

export class SurveyCreationVoiceHandler extends BaseVoiceHandler {
  private state: CreationState;

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
        additionalContext: false,
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
      await Promise.all([
        db.insert(voiceSessions).values({
          id: this.state.voiceSessionId,
          userId: this.userId,
          sessionType: "survey_creation", 
          status: "active",
          startedAt: new Date(),
        }),
        Promise.resolve(this.initializeSTTSession()),
      ]);

      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
      });

      // Send initial greeting if no messages yet - use cached audio for instant playback
      if (this.state.messages.length === 0) {
        const greetingKey = `${this.state.language}-survey-creation` as keyof typeof GREETING_TEXTS;
        const cachedAudio = getCachedGreeting(greetingKey);
        const greetingText = getGreetingText(greetingKey);

        if (cachedAudio) {
          // Use cached audio - instant playback!
          console.log(`[Survey Creation Voice] Using cached greeting for ${greetingKey}`);
          
          // Add to message history
          const assistantMsg = {
            role: "assistant" as const,
            content: greetingText,
            timestamp: new Date().toISOString(),
          };
          this.state.messages.push(assistantMsg);

          // Send audio directly (no TTS API call)
          this.ws.send(cachedAudio);
          this.send({
            type: "audio_sent",
            text: greetingText,
            durationMs: 3000, // Approximate
          });
        } else {
          // Fallback to regular TTS if cache miss
          console.log(`[Survey Creation Voice] Cache miss for ${greetingKey}, using live TTS`);
          await this.sendAssistantResponse(greetingText);
        }
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
      case "set_language":
        if (message.language && ["en", "fr", "de"].includes(message.language)) {
          this.state.language = message.language;
          if (this.state.surveyId) {
             await db.update(surveys)
               .set({ language: message.language })
               .where(eq(surveys.id, this.state.surveyId));
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

    if (survey && (survey.language === "en" || survey.language === "fr" || survey.language === "de")) {
      this.state.language = survey.language;
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

  // Override to perform extraction in background
  async processUserMessage(text: string): Promise<void> {
     await this.processTextMessage(text);
  }

  private async processTextMessage(text: string): Promise<void> {
    this.state.isProcessing = true;
    console.log(`[Survey Creation Voice] Generating AI response for: "${text}"`);
    try {
      // Add user message
      const userMsg = {
        role: "user" as const,
        content: text,
        timestamp: new Date().toISOString(),
      };
      this.state.messages.push(userMsg);
      await this.saveConversation();

      const systemPrompt = getSurveyCreationSystemPrompt(
        this.state.collectedInfo, 
        this.state.language,
        this.state.extractedData?.domainId as number | undefined
      );
      
      const { text: responseText } = await generateText({
        model: defaultModel,
        system: systemPrompt,
        messages: this.state.messages.map(m => ({ role: m.role, content: m.content })),
      });

      console.log(`[Survey Creation Voice] AI response generated: "${responseText}"`);
      await this.sendAssistantResponse(responseText);
      
      this.performExtraction().catch(console.error);

    } catch (error) {
      console.error("[Survey Creation Voice] Processing error:", error);
      this.sendError("Sorry, I had trouble processing that.");
    } finally {
      this.state.isProcessing = false;
    }
  }

  private async sendAssistantResponse(text: string): Promise<void> {
    console.log(`[Survey Creation Voice] Sending assistant response via TTS`);
    const assistantMsg = {
      role: "assistant" as const,
      content: text,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(assistantMsg);
    await this.saveConversation();

    try {
      const synthesis = await this.tts.synthesizeForSurvey(text, "casual", this.state.language);
      if ("audio" in synthesis) {
        this.ws.send(synthesis.audio);
        this.send({
          type: "audio_sent",
          text,
          durationMs: synthesis.duration,
        });
        console.log(`[Survey Creation Voice] Audio response sent (${synthesis.duration}ms)`);
      } else {
        this.send({ type: "text_response", text });
        console.log(`[Survey Creation Voice] Text response sent (TTS failed)`);
      }
    } catch (error) {
      console.error(`[Survey Creation Voice] TTS error:`, error);
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
