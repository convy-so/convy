import { db } from "@/db";
import {
  surveyCreationConversations,
  voiceSessions,
  surveys,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import {
  getSurveyDataExtractionPrompt,
  type CollectedInfo,
  type SurveyConfig,
} from "@/lib/prompts";
import { analysisModel } from "@/lib/ai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AuthenticatedConnection } from "../middleware/auth";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import { CreationSpecialist } from "@/lib/agents/creation-specialist";
import type { AgentContext } from "@/lib/agents/types";
import {
  buildVoiceAgentSettings,
  type VoiceAgentSettings,
  type SupportedLanguage,
  type VoiceAgentFunction,
  type FunctionCallRequestEvent,
  type ConversationTextEvent,
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
        media: false,
        subjectModelComplete: false,
      },
      isProcessing: false,
      language: "en",
      extractedData: null as any,
    };
  }

  async initialize(): Promise<void> {
    try {
      console.log(
        `[Survey Creation Voice] Initializing session: ${this.state.voiceSessionId} for user: ${this.userId}`,
      );

      // Fetch user's preferred language
      try {
        const { getUserPreferredLanguage } =
          await import("@/lib/translation-service");
        const userLanguage = await getUserPreferredLanguage(this.userId!);
        this.state.language = userLanguage;
        console.log(
          `[Survey Creation Voice] User preferred language: ${userLanguage}`,
        );
      } catch (error) {
        console.error(
          "[Survey Creation Voice] Failed to fetch user language, defaulting to 'en':",
          error,
        );
        this.state.language = "en";
      }

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
      console.log("[Survey Creation Voice] Sent 'ready' message to client");

      await dbInsertPromise;
      console.log("[Survey Creation Voice] Session DB record created");
    } catch (error) {
      console.error("[Survey Creation Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    // Build a partial SurveyConfig from extracted data for the agent
    const partialConfig: SurveyConfig = {
      id: this.state.surveyId || "temp",
      information:
        this.state.extractedData?.information || "Creating a new survey",
      requiredQuestions: this.state.extractedData?.requiredQuestions || [],
      metrics: this.state.extractedData?.metrics || [],
      language: this.state.language,
      objective: this.state.extractedData?.objective,
      targetAudience: this.state.extractedData?.targetAudience,
      scope: this.state.extractedData?.scope,
      successCriteria: this.state.extractedData?.successCriteria,
      constraints: this.state.extractedData?.constraints,
      hypotheses: this.state.extractedData?.hypotheses,
      tone: this.state.extractedData?.tone || "casual",
      media: this.state.extractedData?.media,
      personalInfo: this.state.extractedData?.personalInfo || [],
      domainId: this.state.extractedData?.domainId,
    };

    // --- AGENT INTEGRATION: Use CreationSpecialist for agentic behavior ---
    const agentContext: AgentContext = {
      conversationId: this.identifier,
      messages: this.state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as any[],
      surveyConfig: partialConfig,
      language: this.state.language,
    };

    const creationAgent = new CreationSpecialist(agentContext);

    // Preload pattern learnings for self-improvement
    await creationAgent.preloadPatternLearnings(["creation", "general"], 2);

    // Use the agent's system prompt (includes domain expertise, checklist)
    const systemPrompt = creationAgent.buildSystemPrompt();
    console.log(
      `[Survey Creation Voice] System Prompt Length: ${systemPrompt.length}`,
    );

    // Use the agent's function definitions (converted to Deepgram format)
    const functions = creationAgent.getDeepgramFunctions();

    return buildVoiceAgentSettings({
      language: this.state.language,
      systemPrompt,
      functions,
      conversationHistory:
        this.state.messages.length > 0
          ? this.state.messages.map((m) => ({
              role: m.role,
              content: m.content,
            }))
          : undefined,
    });
  }

  // Removed buildFunctionDefinitions() - now using CreationSpecialist.getDeepgramFunctions()

  protected async onFunctionCall(
    event: FunctionCallRequestEvent,
  ): Promise<void> {
    console.log(
      `[SurveyCreationVoiceHandler] 🛠️ Tool Call: ${event.function_name}`,
      event.input,
    );

    try {
      if (event.function_name === "finishSurvey") {
        const { reason } = event.input;
        console.log(
          `[SurveyCreationVoiceHandler] finishSurvey called. Reason: ${reason}`,
        );

        // Perform final extraction
        await this.performExtraction();

        // Notify client
        this.send({ type: "survey_completed" }); // Client should handle this to show "Go to Sample" button

        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({ success: true }),
        );
      } else if (event.function_name === "requestMediaUpload") {
        const { allowedTypes } = event.input;
        console.log(
          `[SurveyCreationVoiceHandler] requestMediaUpload called. Types: ${allowedTypes}`,
        );

        // Notify client to show upload UI
        this.send({
          type: "request_media_upload",
          allowedTypes,
        });

        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({
            success: true,
            message: "Upload UI presented to user.",
          }),
        );
      } else {
        // Unknown function
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({ error: "Function not found" }),
        );
      }
    } catch (error) {
      console.error(`[SurveyCreationVoiceHandler] Tool Call Error:`, error);
      this.voiceAgent?.sendFunctionCallResponse(
        event.function_call_id,
        event.function_name,
        JSON.stringify({ error: "Internal error executing function" }),
      );
    }
  }

  protected getInitialUserInput(): string | null {
    // Only trigger the AI to start if we don't have history yet
    if (this.state.messages.length > 0) {
      return null;
    }
    // Trigger the AI to start the survey creation process dynamically
    return "Start the survey creation conversation. Greet the user warmly and ask about their survey objective.";
  }

  protected async onConversationText(
    event: ConversationTextEvent,
  ): Promise<void> {
    const now = new Date();
    const lastMessage = this.state.messages[this.state.messages.length - 1];

    // Aggregation logic: Same role and within 5 seconds
    if (
      lastMessage &&
      lastMessage.role === event.role &&
      lastMessage.timestamp &&
      now.getTime() - new Date(lastMessage.timestamp).getTime() < 3000
    ) {
      console.log(
        `[SurveyCreationVoiceHandler] 🔄 Aggregating ${event.role} message in DB`,
      );
      lastMessage.content += " " + event.content;
      lastMessage.timestamp = now.toISOString(); // Refresh timestamp for consecutive merges
    } else {
      // Add as a new message
      this.state.messages.push({
        role: event.role,
        content: event.content,
        timestamp: now.toISOString(),
      });
    }

    await this.saveConversation();

    // Trigger extraction after assistant messages
    if (event.role === "assistant") {
      this.performExtraction().catch(console.error);
    }
  }

  protected async handleControlMessage(message: any): Promise<void> {
    switch (message.type) {
      case "set_survey_id":
        console.log(
          `[Survey Creation Voice] Received 'set_survey_id' for survey: ${message.surveyId}`,
        );
        this.state.surveyId = message.surveyId;
        try {
          console.log(
            `[Survey Creation Voice] Loading existing state for survey: ${message.surveyId}...`,
          );
          await this.loadExistingState();
          console.log(
            `[Survey Creation Voice] State loaded. Sending 'survey_state_loaded' to client.`,
          );
          // Notify client that state is loaded so it can safely start conversation
          this.send({ type: "survey_state_loaded" });
        } catch (error) {
          console.error(
            `[Survey Creation Voice] Error loading state for survey ${message.surveyId}:`,
            error,
          );
          this.sendError("Failed to load survey state");
        }
        break;

      case "update_collected_info":
        if (message.collectedInfo) {
          this.state.collectedInfo = {
            ...this.state.collectedInfo,
            ...message.collectedInfo,
          };
        }
        break;

      case "start_conversation":
        console.log(
          `[Survey Creation Voice] Received 'start_conversation'. Reloading state to ensure fresh context...`,
        );
        // Reload state to get latest domain/messages from DB (e.g. if updated via REST API or text chat)
        await this.loadExistingState();

        console.log(
          `[Survey Creation Voice] State reloaded. History length: ${this.state.messages.length}`,
        );
        // Connect the Voice Agent (with greeting if new session)
        await this.connectVoiceAgent();
        console.log(
          "[Survey Creation Voice] connectVoiceAgent() completed (or initiated)",
        );
        break;

      case "text_message":
        if (message.text) {
          if (this.voiceAgent?.connected) {
            this.voiceAgent.sendInjectUserMessage(message.text);
          }
        }
        break;

      case "set_language":
        if (
          message.language &&
          ["en", "fr", "de", "es", "it"].includes(message.language)
        ) {
          this.state.language = message.language;
          if (this.state.surveyId) {
            await db
              .update(surveys)
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
      await db
        .update(voiceSessions)
        .set({ surveyId: this.state.surveyId })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));
    }
  }

  private async saveConversation(): Promise<void> {
    if (!this.state.surveyId) return;

    await db
      .update(surveyCreationConversations)
      .set({
        messages: this.state.messages,
        status: "in_progress",
      })
      .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));
  }

  private async performExtraction(): Promise<void> {
    if (!this.state.surveyId || this.state.messages.length < 2) return;

    try {
      console.log(
        `[Survey Creation Voice] Starting extraction. Message count: ${this.state.messages.length}`,
      );
      const extractionPrompt = getSurveyDataExtractionPrompt(
        this.state.messages,
      );

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
            media: z
              .array(
                z.object({
                  id: z.string(),
                  url: z.string(),
                  type: z.enum(["image", "audio", "video"]),
                  description: z.string(),
                  contextForUse: z.string(),
                }),
              )
              .nullable(),
            title: z.any().nullable(),
            collectedInfo: z.any(),
          }) as any,
        }),
        prompt: extractionPrompt,
      });

      console.log(
        "[Survey Creation Voice] Extraction completed. Data:",
        JSON.stringify(parsed, null, 2),
      );

      const { collectedInfo, ...extractedData } = parsed as any;

      this.state.collectedInfo = collectedInfo;

      await db
        .update(surveyCreationConversations)
        .set({
          extractedData: extractedData,
          collectedInfo: collectedInfo,
        })
        .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));

      console.log("[Survey Creation Voice] Updated DB with extracted data.");

      this.send({
        type: "update_extracted_data",
        extractedData,
        collectedInfo,
      });
      console.log(
        "[Survey Creation Voice] Sent 'update_extracted_data' to client.",
      );
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

      await db
        .update(surveyCreationConversations)
        .set({
          durationMs: sessionDurationMs,
          activeDurationMs: Math.round(this.activeDurationMs),
        })
        .where(eq(surveyCreationConversations.surveyId, this.state.surveyId))
        .catch(console.error);
    }
  }
}
