import { WebSocket } from "ws";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  surveys,
  sampleConversations,
  voiceSessions,
} from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { AudioBufferManager } from "@/lib/voice/audio-processing";
import {
  getGoogleSTTService,
  GoogleSTTStreamingSession,
} from "@/lib/voice/google-stt";
import { getTTSService } from "@/lib/voice/google-tts";
import {
  getSampleConversationSystemPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { defaultModel, } from "@/lib/ai";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { buildCompleteSurveyConfig} from "@/lib/surveys";
import {
  type RollingContext,
  createRollingContext,
} from "@/lib/conversation-memory";
import type { AuthenticatedConnection } from "../middleware/auth";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SPEECH_PROCESSING_DELAY_MS = 800;

interface ResponseState {
  surveyId: string;
  conversationId: string | null;
  conversationNumber: number;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  isProcessing: boolean;
  survey: typeof surveys.$inferSelect | null;
  language: "en" | "fr" | "de";
  context: RollingContext | null;
  surveyConfig: SurveyConfig | null;
}

export class SampleSurveyVoiceHandler {
  private ws: WebSocket;
  private surveyId: string;
  private userId: string;
  private identifier: string;
  private audioBuffer: AudioBufferManager;
  private state: ResponseState;
  private sttService: ReturnType<typeof getGoogleSTTService>;
  private sttSession: GoogleSTTStreamingSession | null = null;
  private tts: ReturnType<typeof getTTSService>;
  private isActive: boolean = true;
  private speechProcessingTimeout: NodeJS.Timeout | null = null;
  private idleTimeout: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();

  constructor(connection: AuthenticatedConnection, surveyId: string, conversationNumber: number = 1) {
    this.ws = connection.ws;
    this.surveyId = surveyId;
    this.userId = connection.userId;
    this.identifier = `sample-${connection.userId}`;
    this.audioBuffer = new AudioBufferManager();
    this.sttService = getGoogleSTTService();
    this.tts = getTTSService();

    this.state = {
      surveyId,
      conversationId: null,
      conversationNumber,
      voiceSessionId: nanoid(),
      messages: [],
      isProcessing: false,
      survey: null,
      language: "en",
      context: null,
      surveyConfig: null,
    };

    this.setupMessageHandlers();
    this.setupConnectionHandlers();
  }

  async initialize(): Promise<void> {
    try {
      const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, this.surveyId));

      if (!survey) {
        this.sendError("Survey not found");
        return;
      }

      if (survey.userId !== this.userId) {
        this.sendError("Unauthorized");
        return;
      }

      // Allow mostly any status for sampling, but check sequential logic
      if (this.state.conversationNumber > survey.sampleConversationCount + 1) {
        this.sendError("Sample conversations must be sequential");
        return;
      }

      this.state.survey = survey;
      this.state.language = survey.language;
      this.state.surveyConfig = buildCompleteSurveyConfig(survey);

      // Setup conversation memory
      const startTime = new Date();
      this.state.context = createRollingContext(this.state.surveyConfig, startTime);

      // Create voice session in database
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        userId: this.userId,
        sessionType: "sample_conversation",
        status: "active",
        startedAt: new Date(),
      });

      // Create sample conversation record
      const conversationId = nanoid();
      await db.insert(sampleConversations).values({
        id: conversationId,
        surveyId: survey.id,
        conversationNumber: this.state.conversationNumber,
        messages: [],
        confirmed: false,
      });

      this.state.conversationId = conversationId;

      this.initializeSTTSession();
      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId: this.state.conversationId,
        conversationNumber: this.state.conversationNumber,
      });
    } catch (error) {
      console.error("[Sample Survey Voice] Initialization error:", error);
      this.sendError("Failed to initialize session");
    }
  }

  private setupMessageHandlers(): void {
    this.ws.on("message", async (data: Buffer) => {
      if (!this.isActive) return;
      this.lastActivityTime = Date.now();
      this.resetIdleTimeout();

      try {
        if (data.length > 100 && data.length < 10000) {
          if (this.sttSession) {
            this.sttSession.write(data);
          }
        } else {
          try {
            const message = JSON.parse(data.toString());
            this.handleJsonMessage(message);
          } catch {
            // Probably binary audio
          }
        }
      } catch (error) {
        console.error("[Sample Survey Voice] Message error:", error);
      }
    });
  }

  private handleJsonMessage(message: any): void {
    switch (message.type) {
      case "ping":
        this.send({ type: "pong" });
        break;
      case "end_session":
        this.cleanup();
        break;
    }
  }

  private initializeSTTSession(): void {
    this.sttSession = this.sttService.createStreamingSession({
      language: this.state.language,
      enableInterimResults: true,
    });

    this.sttSession.on("transcript", (result) => {
      if (result.isFinal) {
        this.handleTranscription(result.transcript);
      }
    });

    this.sttSession.on("error", (error) => {
      console.error("[Sample Survey Voice] STT Error:", error);
    });
  }

  private async handleTranscription(text: string): Promise<void> {
    if (this.state.isProcessing) return;
    this.state.isProcessing = true;

    try {
      this.state.messages.push({
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      });

      await this.generateResponse();
    } finally {
      this.state.isProcessing = false;
    }
  }

  private async generateResponse(): Promise<void> {
    try {
      if (!this.state.surveyConfig) return;

      // Get previous feedback for rehearsal
      const previousFeedbackRows = await db
        .select({ feedback: sampleConversations.feedback, finalComments: sampleConversations.finalComments })
        .from(sampleConversations)
        .where(and(eq(sampleConversations.surveyId, this.surveyId), lt(sampleConversations.conversationNumber, this.state.conversationNumber)));
      
      const combinedFeedback = previousFeedbackRows
        .flatMap(r => [r.feedback, r.finalComments])
        .filter(Boolean)
        .join("\n\n");

      const systemPrompt = getSampleConversationSystemPrompt(
        this.state.surveyConfig,
        combinedFeedback || undefined,
        this.state.conversationNumber,
        this.state.language
      );

      const tools = {
        showMedia: tool({
          description: "Display a media item during the sample voice call",
          inputSchema: z.object({ mediaId: z.string() }),
          execute: async ({ mediaId }) => {
            const media = this.state.surveyConfig?.media?.find(m => m.id === mediaId);
            if (!media) return { error: "Media not found" };
            this.send({ type: "display_media", media });
            return { success: true, displayed: true };
          }
        })
      };

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

      await this.synthesizeAndSendAudio(responseText);
    } catch (error) {
      console.error("[Sample Survey Voice] Response error:", error);
    }
  }

  private async synthesizeAndSendAudio(text: string): Promise<void> {
    try {
      const tone = this.state.survey?.tone || "casual";
      const synthesis = await this.tts.synthesizeForSurvey(text, tone, this.state.language);
      
      if ("audio" in synthesis) {
        this.ws.send(synthesis.audio);
        this.send({ type: "audio_sent", durationMs: synthesis.duration });
      } else {
        this.send({ type: "text_response", text });
      }
    } catch (error) {
      this.send({ type: "text_response", text });
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
    this.ws.close();
  }
}
