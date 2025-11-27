"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { generateAIResponse } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSampleConversationSystemPrompt,
  type SurveyConfig,
} from "@/lib/prompts";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const generateSampleConversationSchema = z.object({
  surveyId: z.string().min(1),
  feedback: z.string().optional(), // Optional feedback from previous conversation
  previousConversationNumber: z.number().int().min(1).max(2).optional(),
});

const confirmSampleConversationSchema = z.object({
  surveyId: z.string().min(1),
  conversationNumber: z.number().int().min(1).max(3),
});

/**
 * Generate a sample conversation for the survey maker to review
 * Maximum of 3 sample conversations allowed
 */
export async function generateSampleConversationAction(
  input: z.infer<typeof generateSampleConversationSchema>
): Promise<
  ActionResult<{
    id: string;
    conversationNumber: number;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }>
> {
  try {
    const session = await getVerifiedSession();
    const body = generateSampleConversationSchema.parse(input);

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

    // Check if we've reached the maximum number of sample conversations
    if (survey.sampleConversationCount >= 3) {
      return {
        success: false,
        error: "Maximum number of sample conversations (3) has been reached",
      };
    }

    // Determine the conversation number
    const conversationNumber = survey.sampleConversationCount + 1;

    // Get previous conversation feedback if this is not the first one
    let feedback: string | undefined = body.feedback;
    if (!feedback && conversationNumber > 1) {
      const [previousConversation] = await db
        .select()
        .from(sampleConversations)
        .where(
          and(
            eq(sampleConversations.surveyId, body.surveyId),
            eq(sampleConversations.conversationNumber, conversationNumber - 1)
          )
        );

      feedback = previousConversation?.feedback ?? undefined;
    }

    // Prepare survey config
    const surveyConfig: SurveyConfig = {
      goal: survey.goal,
      type: survey.type,
      information: survey.information,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics || [],
    };

    // Generate system prompt
    const systemPrompt = getSampleConversationSystemPrompt(
      surveyConfig,
      feedback,
      conversationNumber
    );

    // Generate the sample conversation
    // We'll simulate a conversation by having the AI generate both sides
    // Request JSON format for easier parsing
    const conversationPrompt = `Generate a complete sample conversation between an interviewer (you) and a participant. The conversation should be natural and cover all the required questions organically.

IMPORTANT: Return the conversation as a JSON array of message objects. Each message should have:
- "role": either "user" (for participant) or "assistant" (for interviewer)
- "content": the message text

Example format:
[
  {"role": "assistant", "content": "Hello! Thank you for participating..."},
  {"role": "user", "content": "Hi, happy to help!"},
  ...
]

Make it realistic and engaging, with 8-15 messages total.`;

    const conversationText = await generateAIResponse(
      conversationPrompt,
      systemPrompt,
      {
        temperature: 0.8,
        maxTokens: 3000,
      }
    );

    // Parse the conversation text into messages
    const messages = parseConversationText(conversationText);

    // Save the sample conversation
    const conversationId = nanoid();
    await db.insert(sampleConversations).values({
      id: conversationId,
      surveyId: body.surveyId,
      conversationNumber,
      messages,
      feedback: body.feedback ?? null,
      confirmed: false,
    });

    // Update survey status and conversation count
    await db
      .update(surveys)
      .set({
        status: "sample_review",
        sampleConversationCount: conversationNumber,
      })
      .where(eq(surveys.id, body.surveyId));

    return {
      success: true,
      data: {
        id: conversationId,
        conversationNumber,
        messages,
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
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
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

    // Check if all sample conversations are confirmed
    const confirmedCount = await db
      .select({ count: sampleConversations.id })
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, body.surveyId),
          eq(sampleConversations.confirmed, true)
        )
      );

    const canConfirmSurvey = confirmedCount.length === survey.sampleConversationCount;

    // If all are confirmed, mark survey as confirmed
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
      return { success: false, error: error.errors[0]?.message ?? "Validation error" };
    }
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
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
export async function getSampleConversationsAction(
  surveyId: string
): Promise<
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
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
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
function parseConversationText(
  text: string
): Array<{ role: "user" | "assistant"; content: string }> {
  // Try to parse JSON format first
  try {
    // Look for JSON array in the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (msg: unknown) =>
            typeof msg === "object" &&
            msg !== null &&
            "role" in msg &&
            "content" in msg &&
            (msg.role === "user" || msg.role === "assistant")
        )
      ) {
        return parsed as Array<{ role: "user" | "assistant"; content: string }>;
      }
    }
  } catch {
    // Fall through to text parsing
  }

  // Fallback: parse text format
  // Look for patterns like "Interviewer:" or "Participant:" or "Assistant:" or "User:"
  const lines = text.split("\n").filter((line) => line.trim());
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let currentRole: "user" | "assistant" | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^(Interviewer|Assistant|AI):/i)) {
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join("\n").trim(),
        });
      }
      currentRole = "assistant";
      currentContent = [trimmed.replace(/^(Interviewer|Assistant|AI):\s*/i, "")];
    } else if (trimmed.match(/^(Participant|User):/i)) {
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join("\n").trim(),
        });
      }
      currentRole = "user";
      currentContent = [trimmed.replace(/^(Participant|User):\s*/i, "")];
    } else if (currentRole) {
      currentContent.push(trimmed);
    }
  }

  // Add the last message
  if (currentRole && currentContent.length > 0) {
    messages.push({
      role: currentRole,
      content: currentContent.join("\n").trim(),
    });
  }

  // If parsing failed, create a simple structure
  if (messages.length === 0) {
    return [
      {
        role: "assistant" as const,
        content: "Hello! Thank you for participating in this survey. Let's get started.",
      },
      {
        role: "user" as const,
        content: text.substring(0, 200) || "Sample response",
      },
    ];
  }

  return messages;
}

