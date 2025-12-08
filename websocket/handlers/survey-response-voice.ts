import { WebSocket } from "ws";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  surveys,
  surveyConversations,
  voiceSessions,
  voiceChunks,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { AudioBufferManager } from "@/lib/voice/audio-processing";
import { getVAD } from "@/lib/voice/vad";
import { getWhisperService } from "@/lib/voice/whisper-stt";
import { getTTSService } from "@/lib/voice/google-tts";
import { CostTracker } from "@/lib/voice/cost-tracking";
import { getSurveyConversationSystemPrompt } from "@/lib/prompts";
import { generateAIResponse } from "@/lib/ai";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
  checkSTTAllowed,
  checkTTSAllowed,
  getClientIdentifier,
} from "../middleware/rate-limit";

/**
 * WebSocket Handler for Voice-Enabled Survey Responses
 * Handles real-time voice conversation for survey takers
 */

interface VoiceMessage {
  type: string;
  [key: string]: any;
}

interface ResponseState {
  surveyId: string;
  conversationId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  isProcessing: boolean;
  survey: any;
  language: "en" | "fr" | "de";
}

export class SurveyResponseVoiceHandler {
  private ws: WebSocket;
  private surveyId: string;
  private identifier: string; // For rate limiting
  private audioBuffer: AudioBufferManager;
  private state: ResponseState;
  private vad: Awaited<ReturnType<typeof getVAD>>;
  private whisper: ReturnType<typeof getWhisperService>;
  private tts: ReturnType<typeof getTTSService>;
  private isActive: boolean = true;
  private participantId: string;

  constructor(ws: WebSocket, surveyId: string, identifier: string) {
    this.ws = ws;
    this.surveyId = surveyId;
    this.identifier = identifier; // For rate limiting
    this.participantId = nanoid(); // Generate anonymous participant ID
    this.audioBuffer = new AudioBufferManager();
    this.whisper = getWhisperService();
    this.tts = getTTSService();

    this.state = {
      surveyId,
      conversationId: null,
      voiceSessionId: nanoid(),
      messages: [],
      isProcessing: false,
      survey: null,
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
      // Load survey
      const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.shareableLink, this.surveyId));

      if (!survey) {
        this.send({
          type: "error",
          error: "Survey not found",
        });
        this.ws.close();
        return;
      }

      if (survey.status !== "active") {
        this.send({
          type: "error",
          error: "Survey is not active",
        });
        this.ws.close();
        return;
      }

      if (survey.currentParticipants >= survey.participantLimit) {
        this.send({
          type: "error",
          error: "Survey has reached participant limit",
        });
        this.ws.close();
        return;
      }

      this.state.survey = survey;
      this.state.language = survey.language;

      // Initialize VAD
      this.vad = await getVAD({ sensitivity: 0.5 });

      // Create voice session in database
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        sessionType: "survey_response",
        status: "active",
        startedAt: new Date(),
      });

      // Create conversation
      const conversationId = nanoid();
      await db.insert(surveyConversations).values({
        id: conversationId,
        surveyId: survey.id,
        voiceSessionId: this.state.voiceSessionId,
        rawConversation: [],
        completed: false,
      });

      this.state.conversationId = conversationId;

      // Increment participant count
      await db
        .update(surveys)
        .set({
          currentParticipants: survey.currentParticipants + 1,
        })
        .where(eq(surveys.id, survey.id));

      // Send ready message
      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId,
        language: this.state.language,
      });

      // Send welcome message
      await this.sendWelcomeMessage();
    } catch (error) {
      console.error("[Survey Response Voice] Initialization error:", error);
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
      // Check message rate limit
      const messageCheck = await checkMessageAllowed(this.identifier);
      if (!messageCheck.allowed) {
        this.send({
          type: "rate_limit",
          error: messageCheck.reason,
          retryAfter: messageCheck.retryAfter,
        });
        return;
      }

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
      console.error("[Survey Response Voice] WebSocket error:", error);
      this.isActive = false;
    });
  }

  /**
   * Handle control messages
   */
  private async handleControlMessage(message: VoiceMessage): Promise<void> {
    switch (message.type) {
      case "stop_speaking":
        // User interrupted - stop current audio
        this.state.isProcessing = false;
        break;

      case "complete":
        await this.handleComplete();
        break;

      default:
        console.warn(
          "[Survey Response Voice] Unknown message type:",
          message.type
        );
    }
  }

  /**
   * Handle incoming audio data
   */
  private async handleAudioData(audioData: Buffer): Promise<void> {
    if (!this.isActive || this.state.isProcessing) return;

    // Check audio chunk rate limit
    const audioCheck = await checkAudioChunkAllowed(this.identifier);
    if (!audioCheck.allowed) {
      this.send({
        type: "rate_limit",
        error: audioCheck.reason,
      });
      return;
    }

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
      console.error("[Survey Response Voice] Audio processing error:", error);
    }
  }

  /**
   * Process accumulated audio buffer
   */
  private async processAudioBuffer(): Promise<void> {
    if (this.state.isProcessing) return;

    const audioBuffer = this.audioBuffer.flush();
    if (!audioBuffer) return;

    // Check STT rate limit
    const sttCheck = await checkSTTAllowed(this.identifier);
    if (!sttCheck.allowed) {
      this.send({
        type: "rate_limit",
        error: sttCheck.reason,
        retryAfter: sttCheck.retryAfter,
      });
      return;
    }

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
          "[Survey Response Voice] Transcription error:",
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

      // Track costs (use participant ID as user ID for public surveys)
      await CostTracker.trackSTT(
        this.participantId,
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
      await this.generateResponse();
    } catch (error) {
      console.error("[Survey Response Voice] Buffer processing error:", error);
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
   */
  private async generateResponse(): Promise<void> {
    try {
      // Build survey config
      const surveyConfig = buildCompleteSurveyConfig(this.state.survey);
      const systemPrompt = getSurveyConversationSystemPrompt(
        surveyConfig,
        this.state.language
      );

      // Generate response
      const response = await generateAIResponse(
        this.state.messages[this.state.messages.length - 1].content,
        systemPrompt,
        {
          temperature: 0.7,
          maxTokens: 500,
        }
      );

      // Add assistant message
      this.state.messages.push({
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      });

      // Update conversation in database
      if (this.state.conversationId) {
        await db
          .update(surveyConversations)
          .set({
            rawConversation: this.state.messages,
          })
          .where(eq(surveyConversations.id, this.state.conversationId));
      }

      // Synthesize speech
      await this.synthesizeAndSendAudio(response);
    } catch (error) {
      console.error(
        "[Survey Response Voice] Response generation error:",
        error
      );
      this.send({
        type: "error",
        error: "Failed to generate response",
      });
    }
  }

  /**
   * Synthesize text to speech and send to client
   */
  private async synthesizeAndSendAudio(text: string): Promise<void> {
    // Check TTS rate limit
    const ttsCheck = await checkTTSAllowed(this.identifier);
    if (!ttsCheck.allowed) {
      // Fall back to text-only response
      this.send({
        type: "text_response",
        text,
        reason: "rate_limit",
      });
      return;
    }

    try {
      const startTime = Date.now();

      // Get survey tone
      const tone = this.state.survey.tone || "casual";

      // Synthesize audio
      const synthesis = await this.tts.synthesizeForSurvey(
        text,
        tone,
        this.state.language
      );

      if ("error" in synthesis) {
        console.error(
          "[Survey Response Voice] Synthesis error:",
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
        this.participantId,
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
      console.error("[Survey Response Voice] Synthesis error:", error);
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
    const welcomeText =
      this.state.survey.welcomeMessage || this.getDefaultWelcomeMessage();

    await this.synthesizeAndSendAudio(welcomeText);

    this.state.messages.push({
      role: "assistant",
      content: welcomeText,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get default welcome message based on language
   */
  private getDefaultWelcomeMessage(): string {
    const messages = {
      en: "Hello! Thank you for participating in this survey. I'd love to hear your thoughts. Let's get started!",
      fr: "Bonjour! Merci de participer à cette enquête. J'aimerais connaître votre avis. Commençons!",
      de: "Hallo! Vielen Dank für Ihre Teilnahme an dieser Umfrage. Ich würde gerne Ihre Meinung hören. Lassen Sie uns beginnen!",
    };
    return messages[this.state.language];
  }

  /**
   * Handle completion of survey
   */
  private async handleComplete(): Promise<void> {
    try {
      // Mark conversation as completed
      if (this.state.conversationId) {
        await db
          .update(surveyConversations)
          .set({ completed: true })
          .where(eq(surveyConversations.id, this.state.conversationId));
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
        type: "completed",
        conversationId: this.state.conversationId,
      });

      this.ws.close();
    } catch (error) {
      console.error("[Survey Response Voice] Completion error:", error);
      this.send({
        type: "error",
        error: "Failed to complete survey",
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
      console.error("[Survey Response Voice] Cleanup error:", error);
    }
  }
}
