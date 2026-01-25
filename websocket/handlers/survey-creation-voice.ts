import { WebSocket } from "ws";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  surveys,
  surveyCreationConversations,
  voiceSessions,
  voiceChunks,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { AudioBufferManager, AUDIO_CONFIG } from "@/lib/voice/audio-processing";
import {
  getGoogleSTTService,
  GoogleSTTStreamingSession,
  type TranscriptionResult,
  type VoiceActivityEvent,
  STT_COST_PER_MINUTE,
} from "@/lib/voice/google-stt";
import { getTTSService } from "@/lib/voice/google-tts";
import { CostTracker } from "@/lib/voice/cost-tracking";
import {
  getSurveyCreationSystemPrompt,
  getSurveyDataExtractionPrompt,
  type CollectedInfo,
} from "@/lib/prompts";
import { defaultModel, analysisModel } from "@/lib/ai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AuthenticatedConnection } from "../middleware/auth";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SPEECH_PROCESSING_DELAY_MS = 800;

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

export class SurveyCreationVoiceHandler {
  private ws: WebSocket;
  private userId: string;
  private identifier: string;
  private audioBuffer: AudioBufferManager;
  private state: CreationState;
  private sttService: ReturnType<typeof getGoogleSTTService>;
  private sttSession: GoogleSTTStreamingSession | null = null;
  private tts: ReturnType<typeof getTTSService>;
  private isActive: boolean = true;
  private pendingTranscription: string = "";
  private speechProcessingTimeout: NodeJS.Timeout | null = null;
  private idleTimeout: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private isSpeechActive: boolean = false;

  constructor(connection: AuthenticatedConnection) {
    this.ws = connection.ws;
    this.userId = connection.userId;
    this.identifier = `creation-${connection.userId}`;
    this.audioBuffer = new AudioBufferManager();
    this.sttService = getGoogleSTTService();
    this.tts = getTTSService();

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

    this.setupMessageHandlers();
    this.setupConnectionHandlers();
  }

  async initialize(): Promise<void> {
    try {
      // Create voice session
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        userId: this.userId,
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

  private setupMessageHandlers(): void {
    this.ws.on("message", async (data: Buffer) => {
      if (!this.isActive) return;
      this.resetIdleTimeout();

      try {
        const messageStr = data.toString();
        try {
          const json = JSON.parse(messageStr);
          await this.handleControlMessage(json);
        } catch {
          // Audio data
          await this.handleAudioData(data);
        }
      } catch (error) {
        console.error("[Survey Creation Voice] Message error:", error);
      }
    });
  }

  private async handleControlMessage(message: any): Promise<void> {
    switch (message.type) {
      case "ping":
        this.send({ type: "pong" });
        break;
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

  private async handleAudioData(audioData: Buffer): Promise<void> {
    if (this.state.isProcessing || !this.sttSession) return;

    this.sttSession.write(audioData);
    
    const bytesPerSample = AUDIO_CONFIG.BIT_DEPTH / 8;
    const chunkDurationMs = (audioData.length / (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS * bytesPerSample)) * 1000;
    
    this.audioBuffer.addChunk(audioData, this.isSpeechActive);
  }

  private initializeSTTSession(): void {
    this.sttSession = this.sttService.createStreamingSession({
      language: this.state.language,
      enableInterimResults: true,
      enableAutoPunctuation: true,
      speechEndTimeout: 1.5,
      singleUtterance: false,
    });

    this.sttSession.on("transcription", (result: TranscriptionResult) => {
      if (result.isFinal) {
        this.pendingTranscription += (this.pendingTranscription ? " " : "") + result.text;
        this.send({
          type: "transcription",
          text: result.text,
          isFinal: true,
        });
      } else {
        this.send({
          type: "transcription_interim",
          text: result.text,
        });
      }
    });

    this.sttSession.on("voiceActivity", (event: VoiceActivityEvent) => {
      switch (event.type) {
        case "SPEECH_START":
          this.isSpeechActive = true;
          if (this.speechProcessingTimeout) {
            clearTimeout(this.speechProcessingTimeout);
            this.speechProcessingTimeout = null;
          }
          this.send({ type: "speech_start" });
          break;
        case "SPEECH_END":
        case "END_OF_UTTERANCE":
          this.isSpeechActive = false;
          this.send({ type: "speech_end" });
          if (this.speechProcessingTimeout) clearTimeout(this.speechProcessingTimeout);
          this.speechProcessingTimeout = setTimeout(() => {
            this.processAccumulatedTranscription();
          }, SPEECH_PROCESSING_DELAY_MS);
          break;
      }
    });

    this.sttSession.on("error", (error) => {
      console.error("[Survey Creation Voice] STT Error:", error);
      this.restartSTTSession();
    });

    this.sttSession.start();
  }

  private async restartSTTSession(): Promise<void> {
    if (!this.isActive) return;
    if (this.sttSession) {
      await this.sttSession.attemptRestart();
    } else {
      this.initializeSTTSession();
    }
  }

  private async processAccumulatedTranscription(): Promise<void> {
    const text = this.pendingTranscription.trim();
    if (!text || this.state.isProcessing) return;

    this.pendingTranscription = "";
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

  private setupConnectionHandlers(): void {
    this.ws.on("close", () => this.cleanup());
    this.ws.on("error", () => this.cleanup());
  }

  private cleanup(): void {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.sttSession) this.sttSession.end();
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    
    db.update(voiceSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(voiceSessions.id, this.state.voiceSessionId))
      .catch(console.error);

    this.ws.close();
  }

  private resetIdleTimeout(): void {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => this.cleanup(), IDLE_TIMEOUT_MS);
  }

  private send(data: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private sendError(message: string): void {
    this.send({ type: "error", error: message });
  }
}
