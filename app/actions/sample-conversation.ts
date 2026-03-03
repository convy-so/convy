"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getSurveyAccessLevel } from "@/lib/workspace-access";
import { getSampleConversationFeedbackPrompt } from "@/lib/prompts";
import { MAX_SAMPLE_CONVERSATIONS } from "@/lib/surveys";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const saveSampleConversationSchema = z.object({
  surveyId: z.string().min(1),
  conversationNumber: z
    .number()
    .int()
    .min(1)
    .max(MAX_SAMPLE_CONVERSATIONS)
    .optional(),
  messages: z.array(messageSchema).min(2),
  generateInsights: z.boolean().optional().default(true),
});

const confirmSampleConversationSchema = z.object({
  surveyId: z.string().min(1),
  conversationNumber: z.number().int().min(1).max(MAX_SAMPLE_CONVERSATIONS),
});

const finalCommentsSchema = z.object({
  surveyId: z.string().min(1),
  conversationNumber: z.number().int().min(1).max(MAX_SAMPLE_CONVERSATIONS),
  comments: z.string(),
});

// Schema for sample conversation insights
export interface SampleConversationInsights {
  summary: string;
  keyFindings: string[];
  coveredTopics: string[];
  missedTopics: string[];
  suggestedImprovements: string[];
  toneAssessment?: string;
}

/**
 * Save the latest sample conversation the survey maker just had with the AI.
 * The conversation itself is conducted through the streaming endpoint so that
 * the survey maker experiences the exact same flow as participants.
 * Now generates AI insights for the sample conversation.
 */
export async function generateSampleConversationAction(
  input: z.infer<typeof saveSampleConversationSchema>,
): Promise<
  ActionResult<{
    id: string;
    conversationNumber: number;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    insights: SampleConversationInsights | null;
    feedbackPrompt: string;
    remainingSamples: number;
    jobId?: string;
  }>
> {
  try {
    const session = await getVerifiedSession();
    const body = saveSampleConversationSchema.parse(input);

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Always use conversationNumber 1 - we only have one sample that gets improved
    const conversationNumber = 1;

    const [existingConversation] = await db
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, body.surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      );

    const conversationId = existingConversation?.id ?? nanoid();

    let jobId: string | undefined;

    if (body.generateInsights !== false) {
      try {
        const { enqueueSampleConversationInsights } =
          await import("@/lib/queue");
        const job = await enqueueSampleConversationInsights({
          surveyId: body.surveyId,
          conversationNumber,
          messages: body.messages,
          userId: session.user.id,
        });
        jobId = job.id;
      } catch (insightsError) {
        console.error("Error enqueuing sample insights job:", insightsError);
      }
    }

    if (existingConversation) {
      await db
        .update(sampleConversations)
        .set({
          messages: body.messages,
          confirmed: false,
          insights: null,
        })
        .where(eq(sampleConversations.id, existingConversation.id));
    } else {
      await db.insert(sampleConversations).values({
        id: conversationId,
        surveyId: body.surveyId,
        conversationNumber,
        messages: body.messages,
        feedback: null,
        confirmed: false,
        insights: null,
        finalComments: null,
      });
    }

    await db
      .update(surveys)
      .set({
        status: "sample_review",
        sampleConversationCount: 1,
      })
      .where(eq(surveys.id, body.surveyId));

    const remainingSamples = 0; // No more samples needed - we iterate on the same one

    const feedbackPrompt = getSampleConversationFeedbackPrompt(
      conversationNumber,
      remainingSamples,
    );

    return {
      success: true,
      data: {
        id: conversationId,
        conversationNumber,
        messages: body.messages,
        insights: null,
        feedbackPrompt,
        remainingSamples,
        jobId,
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
    return { success: false, error: "Failed to generate sample conversation" };
  }
}

/**
 * Provide feedback on a sample conversation and optionally generate a new one
 */
export async function provideSampleConversationFeedbackAction(
  surveyId: string,
  conversationNumber: number,
  feedback: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access !== "owner" && access !== "editor") {
      return { success: false, error: "Unauthorized" };
    }

    const [conversation] = await db
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      );

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    await db
      .update(sampleConversations)
      .set({ feedback })
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      );

    return { success: true, data: { id: surveyId } };
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
    return { success: false, error: "Failed to save feedback" };
  }
}

/**
 * Confirm a sample conversation (mark it as approved)
 */
export async function confirmSampleConversationAction(
  input: z.infer<typeof confirmSampleConversationSchema>,
): Promise<ActionResult<{ id: string; canConfirmSurvey: boolean }>> {
  try {
    const session = await getVerifiedSession();
    const body = confirmSampleConversationSchema.parse(input);

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }
    await db
      .update(sampleConversations)
      .set({ confirmed: true })
      .where(
        and(
          eq(sampleConversations.surveyId, body.surveyId),
          eq(sampleConversations.conversationNumber, body.conversationNumber),
        ),
      );

    const [allConversations, confirmedConversations] = await Promise.all([
      db
        .select({ id: sampleConversations.id })
        .from(sampleConversations)
        .where(eq(sampleConversations.surveyId, body.surveyId)),
      db
        .select({ id: sampleConversations.id })
        .from(sampleConversations)
        .where(
          and(
            eq(sampleConversations.surveyId, body.surveyId),
            eq(sampleConversations.confirmed, true),
          ),
        ),
    ]);

    const canConfirmSurvey =
      allConversations.length > 0 &&
      confirmedConversations.length >= 1 &&
      allConversations.length <= MAX_SAMPLE_CONVERSATIONS;

    if (canConfirmSurvey) {
      await db
        .update(surveys)
        .set({ confirmed: true })
        .where(eq(surveys.id, body.surveyId));
    }

    return {
      success: true,
      data: { id: body.surveyId, canConfirmSurvey },
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
    return { success: false, error: "Failed to confirm sample conversation" };
  }
}

/**
 * Add final comments after a sample conversation
 * These are the survey maker's thoughts on what to add, emphasize, or change
 */
export async function addSampleConversationFinalCommentsAction(
  input: z.infer<typeof finalCommentsSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = finalCommentsSchema.parse(input);

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const [conversation] = await db
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, body.surveyId),
          eq(sampleConversations.conversationNumber, body.conversationNumber),
        ),
      );

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    await db
      .update(sampleConversations)
      .set({ finalComments: body.comments })
      .where(eq(sampleConversations.id, conversation.id));

    return { success: true, data: { id: conversation.id } };
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
    return { success: false, error: "Failed to add final comments" };
  }
}

/**
 * Get all sample conversations for a survey
 * Now includes insights and final comments
 */
export async function getSampleConversationsAction(surveyId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      conversationNumber: number;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      feedback: string | null;
      confirmed: boolean;
      insights: SampleConversationInsights | null;
      finalComments: string | null;
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

    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    const conversations = await db
      .select()
      .from(sampleConversations)
      .where(eq(sampleConversations.surveyId, surveyId))
      .orderBy(sampleConversations.conversationNumber);

    const formattedConversations = conversations.map((conv) => ({
      id: conv.id,
      conversationNumber: conv.conversationNumber,
      messages: conv.messages,
      feedback: conv.feedback,
      confirmed: conv.confirmed,
      insights: conv.insights as SampleConversationInsights | null,
      finalComments: conv.finalComments,
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
    return { success: false, error: "Failed to fetch sample conversations" };
  }
}

/**
 * Get sample conversation status for a survey
 * Returns information about sample conversation progress
 */
export async function getSampleConversationStatusAction(
  surveyId: string,
): Promise<
  ActionResult<{
    totalSamples: number;
    maxSamples: number;
    confirmedSamples: number;
    remainingSamples: number;
    canConfirmSurvey: boolean;
    feedbackPrompt: string | null;
  }>
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

    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    const conversations = await db
      .select()
      .from(sampleConversations)
      .where(eq(sampleConversations.surveyId, surveyId));

    const totalSamples = conversations.length;
    const confirmedSamples = conversations.filter((c) => c.confirmed).length;
    const remainingSamples = MAX_SAMPLE_CONVERSATIONS - totalSamples;
    const canConfirmSurvey = totalSamples > 0 && confirmedSamples >= 1;

    let feedbackPrompt: string | null = null;
    if (remainingSamples > 0 && totalSamples > 0) {
      feedbackPrompt = getSampleConversationFeedbackPrompt(
        totalSamples,
        remainingSamples,
      );
    }

    return {
      success: true,
      data: {
        totalSamples,
        maxSamples: MAX_SAMPLE_CONVERSATIONS,
        confirmedSamples,
        remainingSamples,
        canConfirmSurvey,
        feedbackPrompt,
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
    return {
      success: false,
      error: "Failed to get sample conversation status",
    };
  }
}

/**
 * Add a comment to a sample conversation
 * This is meant for workspace members to give feedback on a sample interaction
 */
export async function addSampleConversationCommentAction(
  surveyId: string,
  conversationNumber: number,
  text: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    // Team comments are a workspace-only feature.
    // Reject if the survey does not belong to an organization.
    if (!survey.organizationId) {
      return {
        success: false,
        error: "Team comments are only available in workspace surveys.",
      };
    }

    const [conversation] = await db
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      );

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    const newComment = {
      id: nanoid(),
      userId: session.user.id,
      userName: session.user.name,
      text,
      createdAt: new Date().toISOString(),
    };

    const currentComments = conversation.comments || [];

    await db
      .update(sampleConversations)
      .set({ comments: [...currentComments, newComment] })
      .where(eq(sampleConversations.id, conversation.id));

    return { success: true, data: { id: conversation.id } };
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
    return { success: false, error: "Failed to add comment" };
  }
}
