import { nanoid } from "nanoid";
import { tool, Output } from "ai";
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
import {
  getSurveyConversationSystemPrompt,
  getSampleConversationSystemPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { analysisModel } from "@/lib/ai";
import { getRedisClient } from "@/lib/redis";

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
   * Load or create the rolling context for a conversation.
   * Handles hydration from Redis, calculating signals, and updating progress.
   */
  static async loadOrCreateContext(
    conversationId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    config: SurveyConfig,
    forceNew: boolean = false
  ): Promise<RollingContext> {
    const redis = getRedisClient();
    const contextKey = getContextKey(conversationId);
    const startTimeKey = getStartTimeKey(conversationId);

    // Try to load existing context
    let context: RollingContext | null = null;
    let startTime = new Date();

    if (!forceNew) {
        const existingContext = await redis.get(contextKey);
        const startTimeStr = await redis.get(startTimeKey);
    
        if (startTimeStr) {
            startTime = new Date(startTimeStr);
        }
    
        if (existingContext) {
            try {
                context = JSON.parse(existingContext) as RollingContext;
            } catch {
                // Formatting error, ignore and recreate
            }
        }
    }

    // Initialize if needed
    if (!context) {
      context = createRollingContext(config, startTime);
      // Store start time for new conversations
      await redis.set(startTimeKey, startTime.toISOString(), "EX", 7200); // 2 hour expiry
    }

    // Update context with current messages (Compression)
    context = buildCompressedContext(messages, context);

    // Calculate quality signals
    context.qualitySignals = calculateQualitySignals(messages);

    // Detect participant style
    context.memory.participantStyle = detectParticipantStyle(messages);

    // Calculate progress
    context.progress = calculateProgress(
      messages,
      config,
      startTime,
      context.memory.topicsCovered
    );

    // Update conversation state
    context.stateContext = {
      ...context.stateContext,
      previousState: context.stateContext.currentState,
      currentState: determineConversationState(
        context.progress,
        messages.length,
        config
      ),
      stateEnteredAt: messages.length,
      transitionReason: null,
    };

    return context;
  }

  /**
   * Update conversation memory asynchronously using AI analysis.
   * This is the "Learning" part of the system.
   */
  static async updateMemoryAsync(
    conversationId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    config: SurveyConfig,
    existingContext: RollingContext
  ): Promise<void> {
    try {
      // Only update every 2-3 exchanges to save costs and avoid thrashing
      if (messages.length < 4 || messages.length % 2 !== 0) return;

      const memoryPrompt = getMemoryUpdatePrompt(
        messages,
        config,
        existingContext.memory
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
        hypothesesEvidence: z.record(z.object({
          supporting: z.array(z.string()),
          contradicting: z.array(z.string())
        })).optional()
      });

      const { output: update } = await import("ai").then(ai => ai.generateText({
        model: analysisModel,
        output: Output.object({ schema }),
        system: "You are an expert conversation analyst. Update the memory based on the latest messages.",
        prompt: memoryPrompt,
        temperature: 0.3,
      }));

      const updatedMemory = applyMemoryUpdate(
        existingContext.memory,
        update,
        config
      );

      // Save updated context to Redis
      const redis = getRedisClient();
      const contextKey = getContextKey(conversationId);
      const updatedContext: RollingContext = {
        ...existingContext,
        memory: updatedMemory,
      };
      await redis.set(contextKey, JSON.stringify(updatedContext), "EX", 7200);
    } catch (error) {
      console.error("[ConversationManager] Memory update error:", error);
      // Non-critical - continue without memory update
    }
  }

  /**
   * Save the current context state to Redis immediately.
   * Useful for ensuring state is persisted between turns even if memory update hasn't run.
   */
  static async saveContext(conversationId: string, context: RollingContext): Promise<void> {
      const redis = getRedisClient();
      await redis.set(getContextKey(conversationId), JSON.stringify(context), "EX", 7200);
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
        language?: "en" | "fr" | "de";
    } = {}
  ): string {
    const { isSample, sampleFeedback, conversationNumber, language } = options;
    const finalLanguage = language || config.language || 'en';

    if (isSample) {
        return getSampleConversationSystemPrompt(
            config,
            sampleFeedback,
            conversationNumber,
            finalLanguage,
            context
        );
    } 

    return getSurveyConversationSystemPrompt(
        config,
        finalLanguage,
        context
    );
  }

  /**
   * Get standard tools available to the AI.
   * Specifically handles 'showMedia'.
   */
  static getTools(config: SurveyConfig, onMediaDisplay?: (media: any) => void) {
      return {
          showMedia: tool({
              description: "Display a media item (image, audio, or video) to the participant in the conversation",
              inputSchema: z.object({
                  mediaId: z.string().describe("The unique ID of the media item to display"),
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
                      }
                  };
              },
          }),
      };
  }
}
