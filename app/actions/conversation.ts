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
import { getSurveyAccessLevel } from "@/lib/workspace-access";
import {
  getConversationInsightsPrompt,
  getConversationSummaryPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { buildCompleteSurveyConfig } from "@/lib/surveys";

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

    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, body.conversationId));

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, conversation.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
      return { success: false, error: "Unauthorized: Editor access required to generate insights" };
    }

    const surveyConfig: SurveyConfig = buildCompleteSurveyConfig(survey);

    const summaryPrompt = getConversationSummaryPrompt(
      conversation.rawConversation,
      surveyConfig
    );
    const summary = await generateAIResponse(summaryPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 1000,
    });

    const insightsPrompt = getConversationInsightsPrompt(
      conversation.rawConversation,
      surveyConfig
    );
    const insightsText = await generateAIResponse(insightsPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 1500,
    });

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

    await db
      .update(surveyConversations)
      .set({ summary })
      .where(eq(surveyConversations.id, body.conversationId));

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
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to generate insights" };
  }
}

/**
 * Mark a conversation as completed and trigger insight generation
 * Insight generation is now handled asynchronously via background job
 */
export async function completeConversationAction(
  conversationId: string
): Promise<ActionResult<{ id: string; jobId?: string }>> {
  try {
    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, conversation.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    await db
      .update(surveyConversations)
      .set({ completed: true })
      .where(eq(surveyConversations.id, conversationId));

    const { enqueueConversationInsights, enqueueNotionSync } =
      await import("@/lib/queue");
    const job = await enqueueConversationInsights({
      conversationId,
      surveyId: conversation.surveyId,
      userId: survey.userId,
    });

    // Trigger Notion sync for this conversation
    try {
      await enqueueNotionSync({
        userId: survey.userId,
        surveyId: conversation.surveyId,
        syncType: "conversation",
        targetId: conversationId,
      });
    } catch (error) {
      console.error("Failed to enqueue Notion sync:", error);
      // Don't fail the request if Notion sync fails
    }

    return {
      success: true,
      data: {
        id: conversationId,
        jobId: job.id,
      },
    };
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
export async function getSurveyConversationsAction(surveyId: string): Promise<
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

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

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
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
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
export async function getConversationAction(conversationId: string): Promise<
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

    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, conversation.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

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
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch conversation" };
  }
}
