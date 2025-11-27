"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
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
});

const confirmSampleConversationSchema = z.object({
  surveyId: z.string().min(1),
  conversationNumber: z.number().int().min(1).max(MAX_SAMPLE_CONVERSATIONS),
});

/**
 * Save the latest sample conversation the survey maker just had with the AI.
 * The conversation itself is conducted through the streaming endpoint so that
 * the survey maker experiences the exact same flow as participants.
 */
export async function generateSampleConversationAction(
  input: z.infer<typeof saveSampleConversationSchema>
): Promise<
  ActionResult<{
    id: string;
    conversationNumber: number;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }>
> {
  try {
    const session = await getVerifiedSession();
    const body = saveSampleConversationSchema.parse(input);

    // Get survey and verify ownership
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

    const conversationNumber =
      body.conversationNumber ?? survey.sampleConversationCount + 1;

    if (conversationNumber > MAX_SAMPLE_CONVERSATIONS) {
      return {
        success: false,
        error: `Maximum number of sample conversations (${MAX_SAMPLE_CONVERSATIONS}) has been reached`,
      };
    }

    if (conversationNumber > survey.sampleConversationCount + 1) {
      return {
        success: false,
        error: "Sample conversations must be completed sequentially",
      };
    }

    const [existingConversation] = await db
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, body.surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber)
        )
      );

    const conversationId = existingConversation?.id ?? nanoid();

    if (existingConversation) {
      await db
        .update(sampleConversations)
        .set({
          messages: body.messages,
          confirmed: false, // force re-confirmation whenever conversation changes
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
      });
    }

    await db
      .update(surveys)
      .set({
        status: "sample_review",
        sampleConversationCount: Math.max(
          survey.sampleConversationCount,
          conversationNumber
        ),
      })
      .where(eq(surveys.id, body.surveyId));

    return {
      success: true,
      data: {
        id: conversationId,
        conversationNumber,
        messages: body.messages,
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
  feedback: string
): Promise<ActionResult<{ id: string }>> {
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

    const [conversation] = await db
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber)
        )
      );

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // Update the conversation with feedback
    await db
      .update(sampleConversations)
      .set({ feedback })
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber)
        )
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
  input: z.infer<typeof confirmSampleConversationSchema>
): Promise<ActionResult<{ id: string; canConfirmSurvey: boolean }>> {
  try {
    const session = await getVerifiedSession();
    const body = confirmSampleConversationSchema.parse(input);

    // Verify survey ownership
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

    // Mark conversation as confirmed
    await db
      .update(sampleConversations)
      .set({ confirmed: true })
      .where(
        and(
          eq(sampleConversations.surveyId, body.surveyId),
          eq(sampleConversations.conversationNumber, body.conversationNumber)
        )
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
            eq(sampleConversations.confirmed, true)
          )
        ),
    ]);

    const canConfirmSurvey =
      allConversations.length > 0 &&
      confirmedConversations.length === allConversations.length &&
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
 * Get all sample conversations for a survey
 */
export async function getSampleConversationsAction(surveyId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      conversationNumber: number;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      feedback: string | null;
      confirmed: boolean;
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

    const conversations = await db
      .select()
      .from(sampleConversations)
      .where(eq(sampleConversations.surveyId, surveyId))
      .orderBy(sampleConversations.conversationNumber);

    return { success: true, data: conversations };
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
 * Helper function to parse conversation text into structured messages
 * This is a simplified parser - in production, you might want to use
 * structured output from the AI or a more sophisticated parsing approach
 */
