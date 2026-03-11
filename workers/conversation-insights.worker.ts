import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  conversationInsights,
  surveyConversations,
  surveys,
} from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import type { ConversationInsightsJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";
import {
  getStructuredConversationInsightsPrompt,
  getImprovedConversationSummaryPrompt,
  type ConversationInsightsAIResponse,
} from "@/lib/analytics-prompts";
import {
  calculateConversationMetrics,
  determineEngagementLevel,
  createFallbackConversationInsights,
  type ConversationInsightData,
} from "@/lib/analytics";
import type { SupportedLanguage } from "@/lib/voice/deepgram-voice-agent";

const jobDataSchema = z.object({
  conversationId: z.string().min(1),
  surveyId: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * Parse AI response for conversation insights
 * Returns structured data or creates fallback
 */
function parseConversationInsightsResponse(
  response: string,
  conversationId: string,
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>,
  fallbackSummary: string,
  dbDurationMs?: number,
  dbActiveDurationMs?: number,
): ConversationInsightData {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        `[Conversation Insights Worker] No JSON found in response for ${conversationId}`,
      );
      return createFallbackConversationInsights(
        conversationId,
        messages,
        fallbackSummary,
      );
    }

    const parsed: ConversationInsightsAIResponse = JSON.parse(jsonMatch[0]);
    const metrics = calculateConversationMetrics(messages);

    // Prioritize precise DB duration metrics if available
    if (dbDurationMs && dbDurationMs > 0) {
      metrics.durationMinutes = Math.round((dbDurationMs / 60000) * 10) / 10;
    }
    if (dbActiveDurationMs && dbActiveDurationMs > 0) {
      metrics.activeDurationMinutes =
        Math.round((dbActiveDurationMs / 60000) * 10) / 10;
    }

    // Transform AI response to our structured format
    const insights: ConversationInsightData = {
      conversationId,
      summary: parsed.summary || fallbackSummary,
      keyFindings: parsed.keyFindings || [fallbackSummary],

      // Use calculated metrics (more reliable than AI estimation)
      messageCount: metrics.messageCount,
      participantResponseCount: metrics.participantResponseCount,
      averageResponseLength: metrics.averageResponseLength,
      durationMinutes: metrics.durationMinutes,
      activeDurationMinutes: metrics.activeDurationMinutes,
      followUpDepth: metrics.followUpDepth,

      // AI-determined quality metrics
      engagementLevel:
        parsed.engagementLevel ||
        determineEngagementLevel(
          metrics.averageResponseLength,
          metrics.followUpDepth,
          metrics.participantResponseCount,
        ),
      responseQuality: Math.min(10, Math.max(1, parsed.responseQuality || 5)),

      // Coverage
      topicsCovered: parsed.topicsCovered || [],
      requiredQuestionsCovered: parsed.requiredQuestionsCovered || [],
      requiredQuestionsMissed: parsed.requiredQuestionsMissed || [],

      // Sentiment
      sentiment: {
        overall: parsed.sentiment?.overall || "neutral",
        score: Math.min(1, Math.max(-1, parsed.sentiment?.score || 0)),
        confidence: Math.min(
          1,
          Math.max(0, parsed.sentiment?.confidence || 0.5),
        ),
      },

      // Extracted data
      extractedMetrics: parsed.extractedMetrics || {},
      respondentData: parsed.respondentData || {},
      notableQuotes: (parsed.notableQuotes || []).map((q) => ({
        text: q.text,
        conversationId,
        context: q.context,
        sentiment: q.sentiment,
      })),
      hypothesisEvidence: parsed.hypothesisEvidence || [],

      // Media interactions
      mediaInteractions: (parsed.mediaInteractions || []).map((m) => ({
        mediaId: m.mediaId,
        mediaType: m.mediaType,
        description: m.description || "",
        wasReferenced: m.wasReferenced ?? false,
        participantEngaged: m.participantEngaged ?? false,
        participantReaction: m.participantReaction || "not_shown",
        clarityScore: Math.min(10, Math.max(1, m.clarityScore || 5)),
        insightQuality: m.insightQuality || "none",
        responsesAboutMedia: m.responsesAboutMedia || [],
        insightsGenerated: m.insightsGenerated || [],
        issuesIdentified: m.issuesIdentified || [],
      })),
    };

    return insights;
  } catch (error) {
    console.error(
      `[Conversation Insights Worker] Failed to parse AI response for ${conversationId}:`,
      error,
    );
    return createFallbackConversationInsights(
      conversationId,
      messages,
      fallbackSummary,
    );
  }
}

/**
 * Worker for generating conversation insights
 * Processes AI-powered analysis of completed survey conversations
 * Enhanced with structured analytics extraction
 */
const conversationInsightsWorker = new Worker<ConversationInsightsJobData>(
  "conversation-insights",
  async (job: Job<ConversationInsightsJobData>) => {
    const validatedData = jobDataSchema.parse(job.data);
    const { conversationId, surveyId } = validatedData;

    console.log(
      `[Conversation Insights Worker] Processing job ${job.id} for conversation ${conversationId}`,
    );

    // Fetch conversation
    const [conversation] = await getDb()
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Fetch survey config
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      throw new Error(`Survey ${surveyId} not found`);
    }

    // Get creator's preferred language for translation
    const { getUserPreferredLanguage, translateConversation } =
      await import("@/lib/translation-service");
    const creatorLanguage = await getUserPreferredLanguage(
      validatedData.userId,
    );
    const conversationLanguage =
      (conversation.originalLanguage as SupportedLanguage) || "en";

    const surveyConfig = buildCompleteSurveyConfig(survey);

    await job.updateProgress(15);

    // Step 1: Generate a quick summary first (for fallback and basic display)
    const summaryPrompt = getImprovedConversationSummaryPrompt(
      conversation.rawConversation,
      surveyConfig,
    );

    const summaryText = await generateAIResponse(summaryPrompt, undefined, {
      model: analysisModel,
      temperature: 0.3,
      maxTokens: 500,
      userId: validatedData.userId,
      surveyId: surveyId,
    });

    await job.updateProgress(35);

    // Step 2: Generate detailed structured insights
    const insightsPrompt = getStructuredConversationInsightsPrompt(
      conversation.rawConversation,
      surveyConfig,
    );

    const insightsResponse = await generateAIResponse(
      insightsPrompt,
      undefined,
      {
        model: analysisModel,
        temperature: 0.3,
        maxTokens: 3000,
        userId: validatedData.userId,
        surveyId: surveyId,
      },
    );

    await job.updateProgress(70);

    // Step 3: Translate conversation if needed
    let translatedConversation = null;
    if (conversationLanguage !== creatorLanguage) {
      try {
        const translation = await translateConversation(
          conversation.rawConversation,
          conversationLanguage,
          creatorLanguage,
        );
        translatedConversation = translation.translatedConversation;
        console.log(
          `[Conversation Insights Worker] Translated conversation from ${conversationLanguage} to ${creatorLanguage}`,
        );
      } catch (error) {
        console.error(
          `[Conversation Insights Worker] Translation failed:`,
          error,
        );
        // Continue without translation
      }
    }

    await job.updateProgress(75);

    // Step 4: Parse and structure the response
    const structuredInsights = parseConversationInsightsResponse(
      insightsResponse,
      conversationId,
      conversation.rawConversation,
      summaryText,
      conversation.durationMs || undefined,
      conversation.activeDurationMs || undefined,
    );

    await job.updateProgress(80);

    // Step 5: Save to database
    // Update conversation with summary and translated conversation
    await getDb()
      .update(surveyConversations)
      .set({
        summary: structuredInsights.summary,
        translatedConversation: translatedConversation || undefined,
      })
      .where(eq(surveyConversations.id, conversationId));

    await job.updateProgress(90);

    // Upsert conversation insights
    const [existingInsight] = await getDb()
      .select()
      .from(conversationInsights)
      .where(eq(conversationInsights.conversationId, conversationId));

    // Prepare insights data for storage
    const insightsData = {
      // Core metrics (for easy querying)
      engagementLevel: structuredInsights.engagementLevel,
      responseQuality: structuredInsights.responseQuality,
      messageCount: structuredInsights.messageCount,
      durationMinutes: structuredInsights.durationMinutes,
      activeDurationMinutes: structuredInsights.activeDurationMinutes,

      // Sentiment
      sentiment: structuredInsights.sentiment,

      // Coverage
      topicsCovered: structuredInsights.topicsCovered,
      requiredQuestionsCovered: structuredInsights.requiredQuestionsCovered,
      requiredQuestionsMissed: structuredInsights.requiredQuestionsMissed,

      // Extracted data
      extractedMetrics: structuredInsights.extractedMetrics,
      respondentData: structuredInsights.respondentData,
      notableQuotes: structuredInsights.notableQuotes,
      hypothesisEvidence: structuredInsights.hypothesisEvidence,

      // Media interactions
      mediaInteractions: structuredInsights.mediaInteractions,

      // Metadata
      version: "2.1",
      generatedAt: new Date().toISOString(),
    };

    // Key findings as separate field for backward compatibility
    const keyFindingsText = structuredInsights.keyFindings.join("\n\n");

    if (existingInsight) {
      await getDb()
        .update(conversationInsights)
        .set({
          insights: insightsData,
          keyFindings: keyFindingsText,
        })
        .where(eq(conversationInsights.conversationId, conversationId));
    } else {
      await getDb().insert(conversationInsights).values({
        id: crypto.randomUUID(),
        conversationId,
        insights: insightsData,
        keyFindings: keyFindingsText,
      });
    }

    await job.updateProgress(100);

    console.log(
      `[Conversation Insights Worker] Completed job ${job.id} for conversation ${conversationId}`,
    );
    console.log(
      `[Conversation Insights Worker] Extracted ${structuredInsights.notableQuotes.length} quotes, ` +
        `${Object.keys(structuredInsights.extractedMetrics).length} metrics, ` +
        `${structuredInsights.mediaInteractions.length} media interactions, ` +
        `engagement: ${structuredInsights.engagementLevel}`,
    );

    // Trigger RAG ingestion
    try {
      const { ingestConversation } = await import("@/lib/rag/ingest");
      await ingestConversation(conversationId);
      console.log(
        `[Conversation Insights Worker] Ingested conversation ${conversationId} into RAG`,
      );
    } catch (error) {
      console.error(
        `[Conversation Insights Worker] RAG ingestion failed:`,
        error,
      );
    }

    // Trigger pattern extraction for self-improvement
    try {
      const { enqueuePatternExtraction } = await import("@/lib/queue");
      await enqueuePatternExtraction({
        conversationId,
        surveyId,
        conversationType: "response",
        domainId: survey.domainId ?? null,
      });
      console.log(
        `[Conversation Insights Worker] Enqueued pattern extraction for conversation ${conversationId}`,
      );
    } catch (error) {
      console.error(
        `[Conversation Insights Worker] Pattern extraction enqueue failed:`,
        error,
      );
      // Don't fail the insights job if pattern extraction fails
    }

    // Schedule analytics generation via scheduler
    try {
      const { scheduleAnalyticsOnNewResponse } =
        await import("@/lib/analytics-scheduler");
      await scheduleAnalyticsOnNewResponse(surveyId, job.data.userId);
    } catch (error) {
      console.error(
        `[Conversation Insights Worker] Failed to schedule analytics:`,
        error,
      );
      // Don't fail the insights job if analytics scheduling fails
    }

    return {
      conversationId,
      summary: structuredInsights.summary,
      insights: insightsData,
      keyFindings: keyFindingsText,
      engagementLevel: structuredInsights.engagementLevel,
      responseQuality: structuredInsights.responseQuality,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000,
    },
  },
);

conversationInsightsWorker.on("completed", (job) => {
  console.log(`[Conversation Insights Worker] Job ${job.id} completed`);
});

conversationInsightsWorker.on("failed", (job, err) => {
  console.error(
    `[Conversation Insights Worker] Job ${job?.id} failed:`,
    err.message,
  );
});

conversationInsightsWorker.on("error", (err) => {
  console.error("[Conversation Insights Worker] Worker error:", err);
});

// Note: Signal handlers are managed by the main index.ts when running all workers together
// Individual signal handlers removed to prevent conflicts

export default conversationInsightsWorker;
