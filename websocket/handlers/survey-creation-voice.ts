import { getDb } from "@/db";
import {
  surveyCreationConversations,
  voiceSessions,
  surveys,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { enqueueCreationExtraction } from "@/lib/queue";

import { type CollectedInfo, type SurveyConfig } from "@/lib/prompts";

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
import { RedisStreamManager } from "@/lib/redis-stream-manager";

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
  /** Timestamp of the last extraction call — used to enforce cooldown */
  lastExtractionAt: number;
}

export class SurveyCreationVoiceHandler extends BaseVoiceAgentHandler {
  public surveyId: string | null = null;
  private state: CreationState;
  private sessionStartTime: number = Date.now();
  private streamManager: RedisStreamManager;

  constructor(connection: AuthenticatedConnection) {
    super(connection.ws, `creation-${connection.userId}`, connection.userId);
    this.streamManager = new RedisStreamManager();

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
      lastExtractionAt: 0,
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

      const dbInsertPromise = getDb().insert(voiceSessions).values({
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
      console.log(
        "[ChainOfTrust] [Server:Creation] 🟢 Sent 'ready' signal to client.",
      );

      await dbInsertPromise;
      console.log(
        "[ChainOfTrust] [Server:Creation] ✅ Session record persisted in DB.",
      );
    } catch (error) {
      console.error("[Survey Creation Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
    }

    // Connect happens on "start_conversation" control message
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected getInitialUserInput(): string | null {
    // Creation flow provides its own greeting via settings/control messages.
    // We return null here to avoid double-greeting or interfering with the specialist's logic.
    return null;
  }

  protected isNewSession(): boolean {
    // Session is brand new if messages array is empty or only contains the pre-inserted draft message
    return this.state.messages.length <= 1;
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
      domainId: this.state.extractedData?.domainId,
      expertState: {
        objective: this.state.extractedData?.objective,
        targetAudience: this.state.extractedData?.targetAudience,
        scope: this.state.extractedData?.scope,
        successCriteria: this.state.extractedData?.successCriteria,
        constraints: this.state.extractedData?.constraints,
        hypotheses: this.state.extractedData?.hypotheses,
      },
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
    await creationAgent.initialize();

    // Preload pattern learnings for self-improvement
    await creationAgent.preloadPatternLearnings(["creation", "general"], 2);

    // Use the agent's system prompt (includes domain expertise, checklist)
    const systemPrompt = creationAgent.buildSystemPrompt();
    console.log(
      `[Survey Creation Voice] System Prompt Length: ${systemPrompt.length}`,
    );

    // Use the agent's function definitions (converted to Deepgram format)
    const functions = creationAgent.getDeepgramFunctions();

    // - Resume with assistant spoke last: no greeting (user's turn)
    let greeting: string | undefined;
    if (this.state.messages.length <= 1) {
      // Brand-new session (length 1 because of DB pre-inserted draft message)
      greeting =
        this.state.messages.length === 1
          ? this.state.messages[0].content
          : "Hi! I'm here to help you build a great survey. What are we looking to measure today?";
    } else {
      const lastMessage = this.state.messages[this.state.messages.length - 1];
      if (lastMessage.role === "user") {
        // User spoke last — briefly acknowledge return and continue
        greeting = "Welcome back! Let me pick up right where we left off.";
      }
      // If assistant spoke last, no greeting — it's the user's turn
    }

    // Determine context messages to send.
    // If it's a brand new session, we don't need to send the single pre-inserted greeting
    // as context because we are already passing it as the `greeting` property.
    const contextMessages =
      this.state.messages.length > 1
        ? this.state.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }))
        : undefined;

    return buildVoiceAgentSettings({
      language: this.state.language,
      systemPrompt,
      functions,
      greeting,
      conversationHistory: contextMessages,
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
      if (event.function_name === "think_and_respond") {
        // 1. Extract the state updates for background processing/saving
        const stateUpdates = event.input.state_updates;
        if (stateUpdates && Object.keys(stateUpdates).length > 0) {
          console.log(
            `[ChainOfTrust] [Server:Creation] 🧠 [think_and_respond] State updates received:`,
            stateUpdates,
          );
        }

        // 2. Extract the text we actually want the TTS to speak
        const messageToUser =
          event.input.message_to_user ||
          "I'm sorry, I'm processing your request.";

        // 3. Complete the function call by giving Deepgram the text to say
        console.log(
          `[ChainOfTrust] [Server:Creation] 📤 [think_and_respond] Responding to Deepgram with text: "${messageToUser.substring(0, 50)}..."`,
        );
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify(messageToUser),
        );

        // 4. (DELETED) Manual push removed to prevent double messages.
        // Deepgram's ConversationText for the tool response will handle this via BaseVoiceAgentHandler.onConversationText.
        // Asynchronously fire extraction logic since state changed
        this.performExtraction().catch((err) =>
          console.error(
            "[ChainOfTrust] [Server:Creation] ❌ Extraction error during tool call:",
            err,
          ),
        );
      } else if (event.function_name === "finishSurvey") {
        const { summary } = event.input;
        console.log(
          `[SurveyCreationVoiceHandler] finishSurvey called. Summary: ${summary}`,
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
          `[ChainOfTrust] [Server:Creation] 🛠️ requestMediaUpload tool triggered. Types: ${allowedTypes}`,
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
      } else if (event.function_name === "setSurveyDomain") {
        const { domainId, summaryOfWhatWeKnow } = event.input;
        console.log(
          `[SurveyCreationVoiceHandler] setSurveyDomain called. Domain: ${domainId}`,
        );

        // Store domain in state's extractedData (persisted via next performExtraction call
        // or immediately via extractedData update below)
        this.state.extractedData = {
          ...(this.state.extractedData || {}),
          domainId,
          summaryOfWhatWeKnow,
        };

        // Persist domain to surveys table (has domainId column) and extractedData to conversation
        if (this.state.surveyId) {
          console.log(
            `[ChainOfTrust] [Server:Creation] 💾 Persisting domain ${domainId} to DB for survey ${this.state.surveyId}`,
          );
          await Promise.all([
            getDb()
              .update(surveys)
              .set({ domainId: Number(domainId) })
              .where(eq(surveys.id, this.state.surveyId)),
            getDb()
              .update(surveyCreationConversations)
              .set({ extractedData: this.state.extractedData })
              .where(
                eq(surveyCreationConversations.surveyId, this.state.surveyId),
              ),
          ]);
        }

        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({
            success: true,
            message: `Domain ${domainId} locked in. Continue with targeted questions.`,
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

    console.log(
      `[ChainOfTrust] [Server:Creation] 💾 Saving conversation history to DB. Total messages: ${this.state.messages.length}`,
    );
    await this.saveConversation();

    // Zero-Loss Broadcast: Append to Redis Stream for collaborators
    if (this.state.surveyId) {
      this.surveyId = this.state.surveyId; // Sync public surveyId
      const streamKey = `stream:survey_creation:${this.state.surveyId}`;
      const eventData = {
        type: "conversation_text",
        role: event.role,
        content: event.content,
        userId: this.userId,
        timestamp: now.toISOString(),
        connectionId: this.identifier, // Use identifier to ignore echo on sender side
      };

      const messageId = await this.streamManager.appendEvent(
        streamKey,
        eventData,
      );
      console.log(
        `[ChainOfTrust] [Server:Creation] 📡 Event appended to stream: ${streamKey} (ID: ${messageId})`,
      );

      // Hybrid Broadcast: Publish to Pub/Sub for immediate notification across servers
      const pubsubChannel = `survey:creation:events:${this.state.surveyId}`;
      const redis = this.streamManager.client;
      await redis.publish(
        pubsubChannel,
        JSON.stringify({
          ...eventData,
          streamId: messageId,
        }),
      );
    }

    // Trigger extraction after assistant messages
    if (event.role === "assistant") {
      this.performExtraction().catch(console.error);
    }
  }

  protected async handleControlMessage(message: any): Promise<void> {
    switch (message.type) {
      case "set_survey_id":
        console.log(
          `[ChainOfTrust] [Server:Creation] 📥 Received 'set_survey_id': ${message.surveyId}`,
        );
        this.state.surveyId = message.surveyId;
        try {
          console.log(
            `[ChainOfTrust] [Server:Creation] 📂 Loading existing state from DB...`,
          );
          await this.loadExistingState();

          // Catch-up: Replay missed events from stream if client provides lastEventId
          if (message.lastEventId && this.state.surveyId) {
            const streamKey = `stream:survey_creation:${this.state.surveyId}`;
            console.log(
              `[ChainOfTrust] [Server:Creation] 🔄 Catching up from event ID: ${message.lastEventId}`,
            );
            const missedEvents = await this.streamManager.readEvents(
              streamKey,
              message.lastEventId,
            );
            if (missedEvents.length > 0) {
              console.log(
                `[ChainOfTrust] [Server:Creation] 🕒 Found ${missedEvents.length} missed events. Replaying...`,
              );
              for (const event of missedEvents) {
                // Only send to this specific connection
                this.send({
                  ...event.data,
                  streamId: event.id,
                  isReplay: true,
                });
              }
            }
          }

          console.log(
            `[ChainOfTrust] [Server:Creation] 📤 State loaded. History: ${this.state.messages.length} msgs. Sending 'survey_state_loaded'.`,
          );
          // Notify client that state is loaded so it can safely start conversation
          this.send({ type: "survey_state_loaded" });
        } catch (error) {
          console.error(
            `[ChainOfTrust] [Server:Creation] ❌ Error loading state/catch-up:`,
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
          `[ChainOfTrust] [Server:Creation] 🚀 Received 'start_conversation'.`,
        );
        // Reload state to get latest domain/messages from DB (e.g. if updated via REST API or text chat)
        await this.loadExistingState();

        console.log(
          `[ChainOfTrust] [Server:Creation] 🔄 Connecting Voice Agent (Deepgram)...`,
        );
        // Connect the Voice Agent (with greeting if new session)
        await this.connectVoiceAgent();
        console.log(
          "[ChainOfTrust] [Server:Creation] ✅ Voice Agent connection request dispatched.",
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
            await getDb()
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

    const [conv] = await getDb()
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));

    // Also fetch the survey to get the language and organizationId
    const [survey] = await getDb()
      .select({
        language: surveys.language,
        organizationId: surveys.organizationId,
        id: surveys.id,
      })
      .from(surveys)
      .where(eq(surveys.id, this.state.surveyId));

    if (survey) {
      this.organizationId = survey.organizationId;
      this.surveyId = survey.id;
      if (["en", "fr", "de", "es", "it"].includes(survey.language)) {
        this.state.language = survey.language as SupportedLanguage;
      }
    }

    if (conv) {
      this.state.messages = (conv.messages as any[]) || [];
      this.state.collectedInfo = conv.collectedInfo as CollectedInfo;
      this.state.extractedData = conv.extractedData || null;

      // Update voice session with surveyId
      await getDb()
        .update(voiceSessions)
        .set({ surveyId: this.state.surveyId })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));
    }
  }

  private async saveConversation(): Promise<void> {
    if (!this.state.surveyId) return;

    await getDb()
      .update(surveyCreationConversations)
      .set({
        messages: this.state.messages,
        status: "in_progress",
      })
      .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));
  }

  private async performExtraction(): Promise<void> {
    if (!this.state.surveyId || this.state.messages.length < 2) return;

    // Cooldown: skip if last extraction was less than 15 seconds ago
    const EXTRACTION_COOLDOWN_MS = 15_000;
    const now = Date.now();
    if (now - this.state.lastExtractionAt < EXTRACTION_COOLDOWN_MS) {
      console.log(
        `[Survey Creation Voice] Extraction skipped — cooldown active (${Math.round((EXTRACTION_COOLDOWN_MS - (now - this.state.lastExtractionAt)) / 1000)}s remaining)`,
      );
      return;
    }
    this.state.lastExtractionAt = now;

    try {
      console.log(
        `[Survey Creation Voice] Enqueueing extraction for survey ${this.state.surveyId} (${this.state.messages.length} messages)`,
      );
      await enqueueCreationExtraction({
        surveyId: this.state.surveyId,
        messages: this.state.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
    } catch (error) {
      console.error(
        "[Survey Creation Voice] Failed to enqueue extraction:",
        error,
      );
    }
  }

  protected async cleanup(): Promise<void> {
    await super.cleanup();

    getDb()
      .update(voiceSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(voiceSessions.id, this.state.voiceSessionId))
      .catch(console.error);

    // Update creation conversation with duration metrics
    if (this.state.surveyId) {
      const sessionDurationMs = Date.now() - this.sessionStartTime;

      await getDb()
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
