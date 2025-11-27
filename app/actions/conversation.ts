"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  conversationInsights,
  surveyConversations,
  surveys,
} from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getConversationInsightsPrompt,
  getConversationSummaryPrompt,
  type SurveyConfig,
} from "@/lib/prompts";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const generateInsightsSchema = z.object({
  conversationId: z.string().min(1),
});

/**
 * Generate summary and insights for a completed conversation
 * This should be called after a conversation is marked as completed
 */
export async function generateConversationInsightsAction(
  input: z.infer<typeof generateInsightsSchema>
): Promise<
  ActionResult<{
    summary: string;
    insights: Record<string, unknown>;
    keyFindings: string;
  }>
> {
  try {
    const session = await getVerifiedSession();
    const body = generateInsightsSchema.parse(input);

    // Get conversation
    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, body.conversationId));

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // Get survey to verify ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, conversation.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Prepare survey config
    const surveyConfig: SurveyConfig = {
      goal: survey.goal,
      type: survey.type,
      information: survey.information,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics || [],
    };

    // Generate summary
    const summaryPrompt = getConversationSummaryPrompt(
      conversation.rawConversation,
      surveyConfig
    );
    const summary = await generateAIResponse(summaryPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 1000,
    });

    // Generate insights
    const insightsPrompt = getConversationInsightsPrompt(
      conversation.rawConversation,
      surveyConfig
    );
    const insightsText = await generateAIResponse(insightsPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 1500,
    });

    // Parse insights (try JSON first, then fallback to text)
    let insights: Record<string, unknown>;
    let keyFindings: string;

    try {
      const jsonMatch = insightsText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
        keyFindings = insightsText.replace(jsonMatch[0], "").trim();
      } else {
        insights = { raw: insightsText };
        keyFindings = insightsText;
      }
    } catch {
      insights = { raw: insightsText };
      keyFindings = insightsText;
    }

    // Update conversation with summary
    await db
      .update(surveyConversations)
      .set({ summary })
      .where(eq(surveyConversations.id, body.conversationId));

    // Save or update insights
    const [existingInsight] = await db
      .select()
      .from(conversationInsights)
      .where(eq(conversationInsights.conversationId, body.conversationId));

    if (existingInsight) {
      await db
        .update(conversationInsights)
        .set({
          insights,
          keyFindings,
        })
        .where(eq(conversationInsights.conversationId, body.conversationId));
    } else {
      await db.insert(conversationInsights).values({
        id: crypto.randomUUID(),
        conversationId: body.conversationId,
        insights,
        keyFindings,
      });
    }

    return {
      success: true,
      data: {
        summary,
        insights,
        keyFindings,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message ?? "Validation error" };
    }
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to generate insights" };
  }
}

/**
 * Mark a conversation as completed and trigger insight generation
 */
export async function completeConversationAction(
  conversationId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    // Get conversation
    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // Mark as completed
    await db
      .update(surveyConversations)
      .set({ completed: true })
      .where(eq(surveyConversations.id, conversationId));

    // Trigger insight generation (this can be done asynchronously)
    // For now, we'll generate it synchronously, but in production you might want
    // to use a background job queue
    await generateConversationInsightsAction({ conversationId });

    return { success: true, data: { id: conversationId } };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to complete conversation" };
  }
}

/**
 * Get all conversations for a survey
 */
export async function getSurveyConversationsAction(
  surveyId: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      rawConversation: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp: string;
      }>;
      summary: string | null;
      completed: boolean;
      createdAt: Date;
      insights: {
        insights: Record<string, unknown>;
        keyFindings: string | null;
      } | null;
    }>
  >
> {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get conversations with insights
    const conversations = await db
      .select({
        id: surveyConversations.id,
        rawConversation: surveyConversations.rawConversation,
        summary: surveyConversations.summary,
        completed: surveyConversations.completed,
        createdAt: surveyConversations.createdAt,
        insights: conversationInsights.insights,
        keyFindings: conversationInsights.keyFindings,
      })
      .from(surveyConversations)
      .leftJoin(
        conversationInsights,
        eq(conversationInsights.conversationId, surveyConversations.id)
      )
      .where(eq(surveyConversations.surveyId, surveyId))
      .orderBy(surveyConversations.createdAt);

    const formattedConversations = conversations.map((conv) => ({
      id: conv.id,
      rawConversation: conv.rawConversation,
      summary: conv.summary,
      completed: conv.completed,
      createdAt: conv.createdAt,
      insights: conv.insights
        ? {
            insights: conv.insights,
            keyFindings: conv.keyFindings,
          }
        : null,
    }));

    return { success: true, data: formattedConversations };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch conversations" };
  }
}

/**
 * Get a single conversation with insights
 */
export async function getConversationAction(
  conversationId: string
): Promise<
  ActionResult<{
    id: string;
    rawConversation: Array<{
      role: "user" | "assistant";
      content: string;
      timestamp: string;
    }>;
    summary: string | null;
    completed: boolean;
    createdAt: Date;
    insights: {
      insights: Record<string, unknown>;
      keyFindings: string | null;
    } | null;
  }>
> {
  try {
    const session = await getVerifiedSession();

    // Get conversation
    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, conversation.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get insights
    const [insights] = await db
      .select()
      .from(conversationInsights)
      .where(eq(conversationInsights.conversationId, conversationId));

    return {
      success: true,
      data: {
        id: conversation.id,
        rawConversation: conversation.rawConversation,
        summary: conversation.summary,
        completed: conversation.completed,
        createdAt: conversation.createdAt,
        insights: insights
          ? {
              insights: insights.insights,
              keyFindings: insights.keyFindings,
            }
          : null,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch conversation" };
  }
}

