import { getDb } from "@/db";
import { surveys, sampleConversations, voiceSessions } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { type SurveyConfig } from "@/lib/prompts";
import { getTimeBasedGreeting } from "@/lib/greetings";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { type RollingContext } from "@/lib/conversation-memory";
import type { AuthenticatedConnection } from "../middleware/auth";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import { ConversationManager } from "@/lib/conversation-manager";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import type { AgentContext } from "@/lib/agents/types";
import {
  buildVoiceAgentSettings,
  type VoiceAgentSettings,
  type VoiceAgentFunction,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
} from "@/lib/voice/deepgram-voice-agent";

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
  language: SupportedLanguage;
  context: RollingContext | null;
  surveyConfig: SurveyConfig | null;
}

export class SampleSurveyVoiceHandler extends BaseVoiceAgentHandler {
  private state: SampleState;
  private sessionStartTime: number = Date.now();

  constructor(
    connection: AuthenticatedConnection,
    surveyId: string,
    conversationNumber: number = 1,
  ) {
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
      const [survey] = await getDb()
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
      this.surveyId = survey.id;
      this.organizationId = survey.organizationId;
      this.state.language = survey.language as SupportedLanguage;
      this.state.surveyConfig = buildCompleteSurveyConfig(survey);

      // Deterministic ID for context persistence
      const contextId = `sample:${this.state.surveyId}:${this.state.conversationNumber}:${this.userId}`;

      // Load or create rolling context
      this.state.context = await ConversationManager.loadOrCreateContext(
        contextId,
        [],
        this.state.surveyConfig,
      );

      // Create voice session in database
      await getDb().insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        userId: this.userId,
        sessionType: "sample_conversation",
        status: "active",
        startedAt: new Date(),
      });

      // Check if sample conversation already exists
      const existingConversation = await getDb()
        .select()
        .from(sampleConversations)
        .where(
          and(
            eq(sampleConversations.surveyId, survey.id),
            eq(
              sampleConversations.conversationNumber,
              this.state.conversationNumber,
            ),
          ),
        )
        .limit(1);

      let conversationId: string;

      if (existingConversation.length > 0) {
        conversationId = existingConversation[0].id;
        console.log(
          `[Sample Survey Voice] Reusing existing conversation ${conversationId}`,
        );
      } else {
        conversationId = nanoid();
        await getDb().insert(sampleConversations).values({
          id: conversationId,
          surveyId: survey.id,
          conversationNumber: this.state.conversationNumber,
          messages: [],
          confirmed: false,
        });
        console.log(
          `[Sample Survey Voice] Created new conversation ${conversationId}`,
        );
      }

      this.state.conversationId = conversationId;
      this.resetIdleTimeout();

      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId: this.state.conversationId,
        conversationNumber: this.state.conversationNumber,
      });

      // Connect Voice Agent immediately (greeting is in Settings)
      await this.connectVoiceAgent();
    } catch (error) {
      console.error("[Sample Survey Voice] Initialization error:", error);
      this.sendError("Failed to initialize session");
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected getInitialUserInput(): string | null {
    // If no history, trigger the AI to generate the initial greeting
    if (this.state.messages.length === 0) {
      return "Start the conversation now. Greet the participant according to the system prompt instructions.";
    }

    // RESUME CASE: Check who spoke last
    const lastMessage = this.state.messages[this.state.messages.length - 1];

    // If the user was the last to speak, the AI must catch up/continue
    if (lastMessage.role === "user") {
      return "The user is returning to this sample survey session and their last response was not addressed. Briefly acknowledge their return and continue the interview naturally, picking up where you left off.";
    }

    // If the assistant spoke last, do nothing (ball is in user's court)
    return null;
  }

  protected isNewSession(): boolean {
    return this.state.messages.length === 0;
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    if (!this.state.surveyConfig || !this.state.context) {
      throw new Error("Survey config or context not initialized");
    }

    // Get previous feedback for rehearsal
    const previousFeedbackRows = await getDb()
      .select({
        feedback: sampleConversations.feedback,
        finalComments: sampleConversations.finalComments,
      })
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, this.state.surveyId),
          lt(
            sampleConversations.conversationNumber,
            this.state.conversationNumber,
          ),
        ),
      );

    const combinedFeedback = previousFeedbackRows
      .flatMap((r) => [r.feedback, r.finalComments])
      .filter(Boolean)
      .join("\n\n");

    // --- AGENT INTEGRATION: Use ConductingSpecialist for agentic behavior ---
    const agentContext: AgentContext = {
      conversationId: `sample-${this.state.surveyId}-${this.state.conversationNumber}`,
      messages: this.state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as any[],
      surveyConfig: this.state.surveyConfig,
      rollingContext: this.state.context,
      language: this.state.language,
      modality: "voice",
      knowledgeContext: combinedFeedback || undefined, // Pass feedback as knowledge context
    };

    const conductingAgent = new ConductingSpecialist(agentContext);
    await conductingAgent.initialize();

    // Preload capabilities
    await Promise.all([
      conductingAgent.preloadSkills(),
      conductingAgent.preloadPatternLearnings(
        ["questioning", "probing", "engagement"],
        2,
      ),
    ]);

    // Use the agent's system prompt (includes domain expertise, checklist, questioning strategy)
    let systemPrompt = conductingAgent.buildSystemPrompt();

    // Add sample-specific instructions
    const sampleInstructions = `
Additional guidance for this rehearsal with the survey creator:
- Treat the survey creator exactly like a participant so they can experience the real flow
- After covering every required topic, wrap up politely just as you would with a participant
- This is sample conversation #${this.state.conversationNumber || 1}${this.state.conversationNumber && this.state.conversationNumber > 1 ? ". Adjust your tone and pacing based on previous feedback." : ""}
${combinedFeedback ? `- Apply the survey creator's latest feedback precisely:\n${combinedFeedback}` : ""}
- CRITICAL: When the survey is finished and you have said goodbye, output this exact token at the very end: [[SURVEY_COMPLETED]]
`;

    systemPrompt = systemPrompt + "\n\n" + sampleInstructions;

    // Use the agent's function definitions (converted to Deepgram format)
    const functions = conductingAgent.getDeepgramFunctions();

    const tone = (this.state.survey?.tone || "casual") as
      | "casual"
      | "formal"
      | "playful"
      | "empathetic";

    return buildVoiceAgentSettings({
      language: this.state.language,
      tone,
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
        `[SampleSurveyVoiceHandler] 🔄 Aggregating ${event.role} message in DB`,
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

    // Save to database
    if (this.state.conversationId) {
      await getDb()
        .update(sampleConversations)
        .set({
          messages: this.state.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        })
        .where(eq(sampleConversations.id, this.state.conversationId));
    }

    // Update context and memory
    if (this.state.surveyConfig && this.state.context) {
      const contextId = `sample:${this.state.surveyId}:${this.state.conversationNumber}:${this.userId}`;

      this.state.context = await ConversationManager.loadOrCreateContext(
        contextId,
        this.state.messages.map((m) => ({ role: m.role, content: m.content })),
        this.state.surveyConfig,
      );

      await ConversationManager.saveContext(contextId, this.state.context);

      // Trigger async memory update (non-blocking)
      if (event.role === "assistant") {
        ConversationManager.updateMemoryAsync(
          contextId,
          this.state.messages,
          this.state.surveyConfig,
          this.state.context,
        ).catch(console.error);
      }
    }
  }

  protected async onFunctionCall(
    event: FunctionCallRequestEvent,
  ): Promise<void> {
    switch (event.function_name) {
      case "showMedia": {
        const mediaId = event.input?.mediaId;
        const media = this.state.surveyConfig?.media?.find(
          (m) => m.id === mediaId,
        );

        if (media) {
          this.send({
            type: "display_media",
            media: {
              id: media.id,
              type: media.type,
              url: media.url,
              description: media.description,
              altText: media.altText,
              durationMs: media.durationMs,
            },
          });
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({
              success: true,
              media: {
                id: media.id,
                type: media.type,
                description: media.description,
              },
            }),
          );
        } else {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Media not found" }),
          );
        }
        break;
      }

      case "finishSurvey": {
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({
            success: true,
            message: "Survey marked as complete",
          }),
        );
        // End session after a brief delay for the agent to speak a farewell
        setTimeout(() => {
          this.send({ type: "survey_completed" });
          this.cleanup();
        }, 500);
        break;
      }

      default:
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({ error: `Unknown function: ${event.function_name}` }),
        );
    }
  }

  protected async handleControlMessage(message: any): Promise<void> {
    if (message.type === "end_session") {
      await this.cleanup();
    }
  }

  // Removed buildFunctionDefinitions() - now using ConductingSpecialist.getDeepgramFunctions()

  protected async cleanup(): Promise<void> {
    await super.cleanup();

    // Update DB status
    if (this.state.voiceSessionId) {
      getDb()
        .update(voiceSessions)
        .set({ status: "completed", endedAt: new Date() })
        .where(eq(voiceSessions.id, this.state.voiceSessionId))
        .catch(console.error);

      // Update sample conversation with duration metrics
      if (this.state.conversationId) {
        const sessionDurationMs = Date.now() - this.sessionStartTime;

        getDb()
          .update(sampleConversations)
          .set({
            durationMs: sessionDurationMs,
            activeDurationMs: Math.round(this.activeDurationMs),
          })
          .where(eq(sampleConversations.id, this.state.conversationId))
          .catch(console.error);
      }
    }
  }
}
