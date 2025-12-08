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
import { AuthenticatedConnection } from "../middleware/auth";
import {
  AudioBufferManager,
  bufferToWav,
  estimateDuration,
} from "@/lib/voice/audio-processing";
import { getVAD } from "@/lib/voice/vad";
import { getWhisperService } from "@/lib/voice/whisper-stt";
import { getTTSService } from "@/lib/voice/google-tts";
import { CostTracker } from "@/lib/voice/cost-tracking";
import { generateAIResponse } from "@/lib/ai";
import {
  getSurveyCreationSystemPrompt,
  type CollectedInfo,
  getSurveyDataExtractionPrompt,
} from "@/lib/prompts";

/**
 * WebSocket Handler for Voice-Enabled Survey Creation
 * Handles real-time voice conversation for creating surveys
 * UPDATED: Now uses proper prompt system with collectedInfo tracking
 */

interface VoiceMessage {
  type: string;
  [key: string]: any;
}

interface CreationState {
  surveyId: string | null;
  conversationId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  collectedInfo: CollectedInfo; // ← FIXED: Now uses proper type
  extractedData: Record<string, unknown>; // ← FIXED: Added extracted data
  isProcessing: boolean;
  language: "en" | "fr" | "de";
}

export class SurveyCreationVoiceHandler {
  private ws: WebSocket;
  private userId: string;
  private sessionId: string;
  private audioBuffer: AudioBufferManager;
  private state: CreationState;
  private vad: Awaited<ReturnType<typeof getVAD>>;
  private whisper: ReturnType<typeof getWhisperService>;
  private tts: ReturnType<typeof getTTSService>;
  private isActive: boolean = true;

  constructor(connection: AuthenticatedConnection) {
    this.ws = connection.ws;
    this.userId = connection.userId;
    this.sessionId = connection.sessionId;
    this.audioBuffer = new AudioBufferManager();
    this.whisper = getWhisperService();
    this.tts = getTTSService();

    // FIXED: Initialize with proper CollectedInfo structure
    this.state = {
      surveyId: null,
      conversationId: null,
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
      },
      extractedData: {},
      isProcessing: false,
      language: "en",
    };

    this.setupMessageHandlers();
    this.setupConnectionHandlers();
  }

  /**
   * Initialize the handler
   */
  async initialize(): Promise<void> {
    try {
      // Initialize VAD
      this.vad = await getVAD({ sensitivity: 0.5 });

      // Create voice session in database
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        userId: this.userId,
        sessionType: "survey_creation",
        status: "active",
        startedAt: new Date(),
      });

      // Send ready message
      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
      });

      // Send welcome message
      await this.sendWelcomeMessage();
    } catch (error) {
      console.error("[Survey Creation Voice] Initialization error:", error);
      this.send({
        type: "error",
        error: "Failed to initialize voice session",
      });
      this.ws.close();
    }
  }

  /**
   * Setup message handlers
   */
  private setupMessageHandlers(): void {
    this.ws.on("message", async (data: Buffer) => {
      try {
        // Try to parse as JSON (control messages)
        const message = JSON.parse(data.toString()) as VoiceMessage;
        await this.handleControlMessage(message);
      } catch {
        // Not JSON, treat as audio data
        await this.handleAudioData(data);
      }
    });
  }

  /**
   * Setup connection handlers
   */
  private setupConnectionHandlers(): void {
    this.ws.on("close", async () => {
      this.isActive = false;
      await this.cleanup();
    });

    this.ws.on("error", (error) => {
      console.error("[Survey Creation Voice] WebSocket error:", error);
      this.isActive = false;
    });
  }

  /**
   * Handle control messages
   */
  private async handleControlMessage(message: VoiceMessage): Promise<void> {
    switch (message.type) {
      case "start":
        await this.handleStart(message);
        break;

      case "stop_speaking":
        // User interrupted - stop current audio
        this.state.isProcessing = false;
        break;

      case "language":
        this.state.language = message.language || "en";
        break;

      case "finalize":
        await this.handleFinalize();
        break;

      default:
        console.warn(
          "[Survey Creation Voice] Unknown message type:",
          message.type
        );
    }
  }

  /**
   * Handle start of survey creation
   */
  private async handleStart(message: VoiceMessage): Promise<void> {
    try {
      // Create survey
      const surveyId = nanoid();
      const conversationId = nanoid();

      await db.insert(surveys).values({
        id: surveyId,
        userId: this.userId,
        title: "Untitled Survey",
        status: "creating",
        language: this.state.language,
        voiceEnabled: true,
      });

      await db.insert(surveyCreationConversations).values({
        id: conversationId,
        surveyId,
        messages: [],
        status: "in_progress",
        voiceSessionId: this.state.voiceSessionId,
        collectedInfo: this.state.collectedInfo,
        extractedData: {},
      });

      // Update voice session with survey ID
      await db
        .update(voiceSessions)
        .set({ surveyId, conversationId })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      this.state.surveyId = surveyId;
      this.state.conversationId = conversationId;

      this.send({
        type: "started",
        surveyId,
        conversationId,
      });
    } catch (error) {
      console.error("[Survey Creation Voice] Start error:", error);
      this.send({
        type: "error",
        error: "Failed to start survey creation",
      });
    }
  }

  /**
   * Handle incoming audio data
   */
  private async handleAudioData(audioData: Buffer): Promise<void> {
    if (!this.isActive || this.state.isProcessing) return;

    try {
      // Detect speech using VAD
      const vadResult = await this.vad.detectSpeech(audioData);

      // Add to buffer only if speech detected (cost optimization)
      this.audioBuffer.addChunk(audioData, vadResult.hasSpeech);

      // Check if we should process the buffer
      if (this.audioBuffer.shouldFlush()) {
        await this.processAudioBuffer();
      }
    } catch (error) {
      console.error("[Survey Creation Voice] Audio processing error:", error);
    }
  }

  /**
   * Process accumulated audio buffer
   */
  private async processAudioBuffer(): Promise<void> {
    if (this.state.isProcessing) return;

    const audioBuffer = this.audioBuffer.flush();
    if (!audioBuffer) return;

    this.state.isProcessing = true;

    try {
      // Transcribe audio
      const startTime = Date.now();
      const transcription = await this.whisper.transcribeWithContext(
        audioBuffer,
        this.state.messages.map((m) => m.content).join(" "),
        this.state.language
      );

      if ("error" in transcription) {
        console.error(
          "[Survey Creation Voice] Transcription error:",
          transcription.error
        );
        this.send({
          type: "error",
          error: "Failed to transcribe audio",
        });
        this.state.isProcessing = false;
        return;
      }

      const processingTime = Date.now() - startTime;

      // Track costs
      await CostTracker.trackSTT(
        this.userId,
        transcription.cost,
        transcription.duration,
        this.state.voiceSessionId
      );

      // Save audio chunk
      await db.insert(voiceChunks).values({
        id: nanoid(),
        sessionId: this.state.voiceSessionId,
        chunkType: "audio_in",
        durationMs: Math.round(transcription.duration),
        sizeBytes: audioBuffer.length,
        transcription: transcription.text,
        cost: transcription.cost.toString(),
        processingTimeMs: processingTime,
      });

      // Send transcription to client
      this.send({
        type: "transcription",
        text: transcription.text,
      });

      // Add user message
      this.state.messages.push({
        role: "user",
        content: transcription.text,
        timestamp: new Date().toISOString(),
      });

      // Generate AI response
      await this.generateResponse(transcription.text);
    } catch (error) {
      console.error("[Survey Creation Voice] Buffer processing error:", error);
      this.send({
        type: "error",
        error: "Failed to process audio",
      });
    } finally {
      this.state.isProcessing = false;
    }
  }

  /**
   * Generate AI response
   * FIXED: Now uses proper prompt system with collectedInfo tracking
   */
  private async generateResponse(userMessage: string): Promise<void> {
    try {
      // FIXED: Get survey creation prompt with collectedInfo tracking
      const systemPrompt = getSurveyCreationSystemPrompt(
        this.state.collectedInfo,
        this.state.language
      );

      // Generate response
      const response = await generateAIResponse(userMessage, systemPrompt, {
        temperature: 0.7,
        maxTokens: 500,
      });

      // Add assistant message
      this.state.messages.push({
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      });

      // FIXED: Extract and update collected information
      await this.updateCollectedInfo();

      // Update conversation in database
      if (this.state.conversationId) {
        await db
          .update(surveyCreationConversations)
          .set({
            messages: this.state.messages,
            collectedInfo: this.state.collectedInfo,
            extractedData: this.state.extractedData,
          })
          .where(eq(surveyCreationConversations.id, this.state.conversationId));
      }

      // FIXED: Send progress update to client
      this.send({
        type: "progress",
        collectedInfo: this.state.collectedInfo,
      });

      // Synthesize speech
      await this.synthesizeAndSendAudio(response);
    } catch (error) {
      console.error(
        "[Survey Creation Voice] Response generation error:",
        error
      );
      this.send({
        type: "error",
        error: "Failed to generate response",
      });
    }
  }

  /**
   * Extract and update collected information from conversation
   * FIXED: NEW METHOD - Extracts structured data like text conversations
   */
  private async updateCollectedInfo(): Promise<void> {
    try {
      // Use AI to analyze what information has been collected
      const extractionPrompt = getSurveyDataExtractionPrompt(
        this.state.messages
      );

      const extractedText = await generateAIResponse(
        extractionPrompt,
        undefined,
        {
          temperature: 0.3,
          maxTokens: 2000,
        }
      );

      // Parse extracted data
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Update collectedInfo flags
        if (parsed.collectedInfo) {
          this.state.collectedInfo = {
            ...this.state.collectedInfo,
            ...parsed.collectedInfo,
          };
        }

        // Update extracted data (excluding collectedInfo)
        const { collectedInfo, ...dataWithoutCollectedInfo } = parsed;
        this.state.extractedData = {
          ...this.state.extractedData,
          ...dataWithoutCollectedInfo,
        };
      }
    } catch (error) {
      console.error("[Survey Creation Voice] Info extraction error:", error);
      // Continue without throwing - extraction is best-effort
    }
  }

  /**
   * Synthesize text to speech and send to client
   */
  private async synthesizeAndSendAudio(text: string): Promise<void> {
    try {
      const startTime = Date.now();

      // Synthesize audio
      const synthesis = await this.tts.synthesizeForSurvey(
        text,
        "casual",
        this.state.language
      );

      if ("error" in synthesis) {
        console.error(
          "[Survey Creation Voice] Synthesis error:",
          synthesis.error
        );
        // Fall back to text response
        this.send({
          type: "text_response",
          text,
        });
        return;
      }

      const processingTime = Date.now() - startTime;

      // Track costs
      await CostTracker.trackTTS(
        this.userId,
        synthesis.cost,
        synthesis.characterCount,
        this.state.voiceSessionId
      );

      // Save audio chunk
      await db.insert(voiceChunks).values({
        id: nanoid(),
        sessionId: this.state.voiceSessionId,
        chunkType: "audio_out",
        durationMs: Math.round(synthesis.duration),
        sizeBytes: synthesis.audio.length,
        synthesisText: text,
        cost: synthesis.cost.toString(),
        processingTimeMs: processingTime,
      });

      // Send audio to client
      this.send({
        type: "audio",
        audio: synthesis.audio.toString("base64"),
        text,
      });
    } catch (error) {
      console.error("[Survey Creation Voice] Synthesis error:", error);
      this.send({
        type: "text_response",
        text,
      });
    }
  }

  /**
   * Send welcome message
   */
  private async sendWelcomeMessage(): Promise<void> {
    const welcomeMessages = {
      en: "Hi! I'm here to help you create an AI-powered survey. Let's start by understanding what you want to learn. What's the goal of your survey?",
      fr: "Bonjour! Je suis là pour vous aider à créer une enquête alimentée par l'IA. Commençons par comprendre ce que vous voulez apprendre. Quel est l'objectif de votre enquête?",
      de: "Hallo! Ich bin hier, um Ihnen bei der Erstellung einer KI-gestützten Umfrage zu helfen. Lassen Sie uns damit beginnen zu verstehen, was Sie lernen möchten. Was ist das Ziel Ihrer Umfrage?",
    };

    const welcomeText = welcomeMessages[this.state.language];
    await this.synthesizeAndSendAudio(welcomeText);

    this.state.messages.push({
      role: "assistant",
      content: welcomeText,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle finalization of survey creation
   * FIXED: Now validates completeness before finalizing
   */
  private async handleFinalize(): Promise<void> {
    try {
      // Final extraction to ensure all data is captured
      await this.updateCollectedInfo();

      // FIXED: Validate that required information is collected
      const requiredFields: (keyof CollectedInfo)[] = [
        "objective",
        "targetAudience",
        "scope",
        "successCriteria",
        "constraints",
      ];

      const missingFields = requiredFields.filter(
        (field) => !this.state.collectedInfo[field]
      );

      if (missingFields.length > 0) {
        this.send({
          type: "error",
          error: `Missing required information: ${missingFields.join(", ")}. Please continue the conversation to provide these details.`,
          missingFields,
        });
        return;
      }

      // FIXED: Update conversation with final extracted data
      if (this.state.conversationId) {
        await db
          .update(surveyCreationConversations)
          .set({
            status: "completed",
            messages: this.state.messages,
            collectedInfo: this.state.collectedInfo,
            extractedData: this.state.extractedData,
          })
          .where(eq(surveyCreationConversations.id, this.state.conversationId));
      }

      // Update voice session status
      await db
        .update(voiceSessions)
        .set({
          status: "completed",
          endedAt: new Date(),
        })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      this.send({
        type: "finalized",
        surveyId: this.state.surveyId,
        collectedInfo: this.state.collectedInfo,
      });

      this.ws.close();
    } catch (error) {
      console.error("[Survey Creation Voice] Finalization error:", error);
      this.send({
        type: "error",
        error: "Failed to finalize survey",
      });
    }
  }

  /**
   * Send message to client
   */
  private send(message: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      // Flush any remaining audio
      if (this.audioBuffer.hasContent()) {
        await this.processAudioBuffer();
      }

      // Update session status if not completed
      const [session] = await db
        .select()
        .from(voiceSessions)
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      if (session && session.status === "active") {
        await db
          .update(voiceSessions)
          .set({
            status: "abandoned",
            endedAt: new Date(),
          })
          .where(eq(voiceSessions.id, this.state.voiceSessionId));
      }

      // Cleanup VAD
      if (this.vad) {
        await this.vad.destroy();
      }
    } catch (error) {
      console.error("[Survey Creation Voice] Cleanup error:", error);
    }
  }
}
