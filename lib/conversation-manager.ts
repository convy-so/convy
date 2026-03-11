import { tool, Output, generateText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  type RollingContext,
  createRollingContext,
  buildCompressedContext,
  calculateQualitySignals,
  detectParticipantStyle,
  calculateProgress,
  determineConversationState,
  getMemoryUpdatePrompt,
  applyMemoryUpdate,
  getContextKey,
  getStartTimeKey,
} from "@/lib/conversation-memory";
import { type SurveyConfig } from "@/lib/prompts";
import { analysisModel } from "@/lib/ai";
import { getRedisClient } from "@/lib/redis";
import { logUsage } from "./billing/logger";

/**
 * ConversationManager
 *
 * Centralizes the core logic for:
 * 1. Context Management (Loading/Creating/Compressing)
 * 2. System Prompt Generation (with Context Injection)
 * 3. Tool Definitions (e.g. showMedia)
 * 4. Asynchronous Memory Updates
 *
 * This ensures parity between Text and Voice implementations (Actual & Sample).
 */
export class ConversationManager {
  /**
   * Normalize messages from various formats (AI SDK ModelMessage/CoreMessage or simple object)
   * to the internal { role, content } format used for analysis and DB storage.
   * Now media-aware: injects markers for tool calls (e.g. showMedia).
   */
  static normalizeMessages(
    messages: Array<any>,
    config?: SurveyConfig,
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const normalized: Array<{ role: "user" | "assistant"; content: string }> =
      [];

    messages.forEach((m) => {
      // Skip system or tool messages for the base list, but we'll extract events from them if needed
      if (m.role !== "user" && m.role !== "assistant") return;

      let content = "";
      if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        // AI SDK Part-based content
        content = m.content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n");
      }

      // Handle tool calls/invocations (e.g. media display events)
      const invocations = m.toolCalls || m.toolInvocations;
      if (m.role === "assistant" && invocations && Array.isArray(invocations)) {
        const markers = invocations
          .map((inv: any) => {
            const toolName = inv.toolName;
            if (toolName === "showMedia") {
              const mediaId = inv.input?.mediaId || inv.args?.mediaId;
              const media = config?.media?.find((item) => item.id === mediaId);
              const label = media
                ? `${media.type} "${media.description}"`
                : `media ${mediaId}`;
              return `[ACTION: Displayed ${label}]`;
            }
            return `[ACTION: Called tool ${toolName}]`;
          })
          .join(" ");

        if (markers) {
          content = (markers + (content ? "\n" + content : "")).trim();
        }
      }

      normalized.push({
        role: m.role as "user" | "assistant",
        content:
          content ||
          (m.role === "assistant" ? "[AI Response]" : "[Empty Message]"),
      });
    });

    return normalized;
  }

  /**
   * Load or create the rolling context for a conversation.
   * Handles hydration from Redis, calculating signals, and updating progress.
   */
  static async loadOrCreateContext(
    conversationId: string,
    messages:
      | Array<{ role: "user" | "assistant"; content: string }>
      | ModelMessage[]
      | any[],
    config: SurveyConfig,
    forceNew: boolean = false,
  ): Promise<RollingContext> {
    // Normalize messages for analysis
    const normalizedMessages = this.normalizeMessages(messages, config);
    console.log(
      `[ConversationManager:loadOrCreateContext] Normalized count: ${normalizedMessages.length}. CID: ${conversationId}`,
    );

    const redis = getRedisClient();
    const contextKey = getContextKey(conversationId);
    const startTimeKey = getStartTimeKey(conversationId);

    // Try to load existing context
    let context: RollingContext | null = null;
    let startTime = new Date();

    if (!forceNew && (redis.status === "ready" || redis.status === "connect")) {
      try {
        console.log(
          `[ConversationManager:loadOrCreateContext] Attempting to load context from Redis...`,
        );
        const result = (await Promise.race([
          Promise.all([redis.get(contextKey), redis.get(startTimeKey)]),
          new Promise<null[]>((_, reject) =>
            setTimeout(() => reject(new Error("Redis timeout")), 1500),
          ),
        ])) as [string | null, string | null];

        const [existingContext, startTimeStr] = result;

        if (startTimeStr) {
          startTime = new Date(startTimeStr);
        }

        if (existingContext) {
          const parsedContext = JSON.parse(existingContext) as RollingContext;

          // Security check: ensure the conversation belongs to this survey
          if (parsedContext.surveyId !== config.id) {
            console.warn(
              `[ConversationManager] Security alert: Conversation ${conversationId} attempted to access survey ${config.id} but belongs to ${parsedContext.surveyId}`,
            );
            // Re-initialize for this survey or throw error.
            // To be safe, we'll treat it as a new conversation for the correct survey.
            context = null;
          } else {
            context = parsedContext;
          }
        }
      } catch (error) {
        console.warn(
          `[ConversationManager] Failed to parse existing context for ${conversationId}, recreating fresh session.`,
          error,
        );
      }
    }

    // Initialize if needed
    if (!context) {
      context = createRollingContext(config.id, config, startTime);
      // Store start time for new conversations - non-blocking safety
      if (redis.status === "ready" || redis.status === "connect") {
        redis
          .set(startTimeKey, startTime.toISOString(), "EX", 7200)
          .catch(() => {});
      }
    }

    // Update context with current messages (Compression)
    context = buildCompressedContext(normalizedMessages, context);

    // Calculate quality signals
    context.qualitySignals = calculateQualitySignals(normalizedMessages);

    // Detect participant style
    context.memory.participantStyle =
      detectParticipantStyle(normalizedMessages);

    // Calculate progress
    context.progress = calculateProgress(
      normalizedMessages,
      config,
      startTime,
      context.memory.topicsCovered,
    );

    // Update conversation state
    context.stateContext = {
      ...context.stateContext,
      previousState: context.stateContext.currentState,
      currentState: determineConversationState(
        context.progress,
        normalizedMessages.length,
        config,
      ),
      stateEnteredAt: normalizedMessages.length,
      transitionReason: null,
    };

    console.log(
      `[ConversationManager:loadOrCreateContext] Updated context. Progress: ${context.progress.completionPercentage}%. State: ${context.stateContext.currentState}`,
    );
    return context;
  }

  /**
   * Update conversation memory asynchronously using AI analysis.
   * This is the "Learning" part of the system.
   */
  static async updateMemoryAsync(
    conversationId: string,
    messages:
      | Array<{ role: "user" | "assistant"; content: string }>
      | ModelMessage[]
      | any[],
    config: SurveyConfig,
    existingContext: RollingContext,
    metadata?: {
      userId?: string;
      organizationId?: string;
    },
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      // Normalize messages for analysis
      const normalizedMessages = this.normalizeMessages(messages, config);

      // Only update every 2-3 exchanges to save costs and avoid thrashing
      if (normalizedMessages.length < 4 || normalizedMessages.length % 2 !== 0)
        return;

      const memoryPrompt = getMemoryUpdatePrompt(
        normalizedMessages,
        config,
        existingContext.memory,
      );

      const schema = z.object({
        keyFactsLearned: z.array(z.string()).optional(),
        topicsCovered: z.array(z.string()).optional(),
        currentTopic: z.string().nullable().optional(),
        unansweredQuestions: z.array(z.string()).optional(),
        emotionalSignals: z.array(z.string()).optional(),
        conversationSummary: z.string().optional(),
        specificExamples: z.array(z.string()).optional(),
        unexploredHypotheses: z.array(z.string()).optional(),
        timelineEvents: z.array(z.string()).optional(),
        peerContext: z.array(z.string()).optional(),
        participantSuggestedSolutions: z.array(z.string()).optional(),
        hypothesesEvidence: z
          .record(
            z.object({
              supporting: z.array(z.string()),
              contradicting: z.array(z.string()),
            }),
          )
          .optional(),
      });

      const { output: update, usage } = await generateText({
        model: analysisModel,
        output: Output.object({ schema }),
        system:
          "You are an expert conversation analyst. Update the memory based on the latest messages.",
        prompt: memoryPrompt,
        temperature: 0.3,
      });

      // Log usage for memory update
      logUsage({
        userId: metadata?.userId,
        organizationId: metadata?.organizationId,
        surveyId: config.id,
        type: "llm_text",
        provider: "google",
        modelName: (analysisModel as any).modelId,
        promptTokens: (usage as any).inputTokens,
        completionTokens: (usage as any).outputTokens,
        totalTokens: (usage as any).totalTokens,
      });

      const updatedMemory = applyMemoryUpdate(
        existingContext.memory,
        update,
        config,
      );

      // Save updated context to Redis - with timeout
      const contextKey = getContextKey(conversationId);
      if (redis.status === "ready" || redis.status === "connect") {
        const updatedContext: RollingContext = {
          ...existingContext,
          memory: updatedMemory,
        };
        await Promise.race([
          redis.set(contextKey, JSON.stringify(updatedContext), "EX", 7200),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Redis write timeout")), 1000),
          ),
        ]).catch((e) =>
          console.warn("[ConversationManager] Redis write failed:", e.message),
        );
      }
    } catch (error) {
      console.error("[ConversationManager] Memory update error:", error);
      // Non-critical - continue without memory update
    }
  }

  static async saveContext(
    conversationId: string,
    context: RollingContext,
  ): Promise<void> {
    const redis = getRedisClient();
    if (redis.status !== "ready" && redis.status !== "connect") return;

    try {
      const contextKey = getContextKey(conversationId);
      await Promise.race([
        redis.set(contextKey, JSON.stringify(context), "EX", 7200),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis write timeout")), 1000),
        ),
      ]);
    } catch (e: any) {
      console.warn("[ConversationManager:saveContext] Failed:", e.message);
    }
  }

  /**
   * Get the system prompt for the conversation.
   * Handles both "Actual" and "Sample" modes.
   */
  static getSystemPrompt(
    config: SurveyConfig,
    context: RollingContext,
    options: {
      isSample?: boolean;
      sampleFeedback?: string;
      conversationNumber?: number;
      language?: "en" | "fr" | "de" | "es" | "it";
    } = {},
  ): string {
    const { isSample, sampleFeedback, conversationNumber, language } = options;
    const finalLanguage = language || config.language || "en";

    if (isSample) {
      return `You are conducting a sample survey conversation for testing purposes. Survey goal: ${config.coreObjective || config.expertState?.objective?.goal || config.information}. Conversation ${conversationNumber ?? 1} of 3.

<reflection_protocol>
Before EVERY response you write, open a <scratchpad> block and silently reason through your checks (Acknowledgment, One Question, Natural Transition, Depth). 
The scratchpad is NEVER shown to the participant. 
Write your actual response AFTER the </scratchpad> tag.
</reflection_protocol>`;
    }

    return `You are a conversational AI interviewer conducting a survey. Survey goal: ${config.coreObjective || config.expertState?.objective?.goal || config.information}.

<reflection_protocol>
Before EVERY response you write, open a <scratchpad> block and silently reason through your checks (Acknowledgment, One Question, Natural Transition, Depth). 
The scratchpad is NEVER shown to the participant. 
Write your actual response AFTER the </scratchpad> tag.
</reflection_protocol>`;
  }

  /**
   * Get standard tools available to the AI.
   * Specifically handles 'showMedia'.
   */
  static getTools(config: SurveyConfig, onMediaDisplay?: (media: any) => void) {
    return {
      showMedia: tool({
        description:
          "Display a media item (image, audio, or video) to the participant in the conversation",
        inputSchema: z.object({
          mediaId: z
            .string()
            .describe("The unique ID of the media item to display"),
        }),
        execute: async ({ mediaId }) => {
          const media = config.media?.find((m) => m.id === mediaId);

          if (!media) {
            return { error: "Media not found" };
          }

          // Execute callback if provided (e.g., for WebSocket)
          if (onMediaDisplay) {
            onMediaDisplay(media);
          }

          return {
            success: true,
            media: {
              id: media.id,
              type: media.type,
              description: media.description,
              url: media.url,
            },
          };
        },
      }),
      finishSurvey: tool({
        description:
          "Signal that the survey conversation is complete and should end. Call this when you have covered all required topics and gathered sufficient information from the participant.",
        inputSchema: z.object({
          reason: z
            .string()
            .optional()
            .describe(
              "Optional brief reason for ending (e.g., 'all topics covered', 'participant request')",
            ),
        }),
        execute: async ({ reason }) => {
          // Execution handled server-side in onFinish callback
          // This just returns confirmation for the AI
          return {
            success: true,
            message: "Survey marked as complete",
            reason: reason || "survey complete",
          };
        },
      }),
    };
  }
}
