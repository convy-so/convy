/**
 * POST /api/surveys/[surveyId]/conversations/[conversationId]/feedback
 *
 * Participant micro-rating submitted at the end of a survey conversation.
 * No authentication required — participants are anonymous.
 *
 * Body: { rating?: 1-5, feltNatural?: bool, uncomfortableTopics?: bool, freeText?: string }
 *
 * Side effects:
 * - Inserts into participant_feedback
 * - If uncomfortableTopics=true, marks all patterns from this conversation as DEPRECATED
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, and, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { surveyConversations } from "@/db/schema";
import { participantFeedback } from "@/db/schema/learning";
import { knowledgeBase } from "@/db/schema/vectors";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  feltNatural: z.boolean().optional(),
  uncomfortableTopics: z.boolean().optional().default(false),
  freeText: z.string().max(1000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string; conversationId: string }> },
) {
  try {
    const { surveyId, conversationId } = await params;

    // Verify conversation belongs to the survey
    const [conv] = await getDb()
      .select({
        id: surveyConversations.id,
        surveyId: surveyConversations.surveyId,
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.id, conversationId),
          eq(surveyConversations.surveyId, surveyId),
        ),
      )
      .limit(1);

    if (!conv) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    // Parse + validate body
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { rating, feltNatural, uncomfortableTopics, freeText } = parsed.data;

    // Insert feedback record
    await getDb()
      .insert(participantFeedback)
      .values({
        id: nanoid(),
        conversationId,
        surveyId,
        rating: rating ?? null,
        feltNatural: feltNatural ?? null,
        uncomfortableTopics: uncomfortableTopics ?? false,
        freeText: freeText ?? null,
      });

    // ── Discomfort veto ──────────────────────────────────────────────────────
    // If participant reported uncomfortable topics, deprecate any patterns
    // that were extracted from this conversation (prevents bad patterns reaching ACTIVE).
    if (uncomfortableTopics) {
      await getDb()
        .update(knowledgeBase)
        .set({ status: "DEPRECATED" })
        .where(
          and(
            // Patterns sourced from this conversation are identified by conversationId in metadata
            sql`${knowledgeBase.metadata}->>'conversationId' = ${conversationId}`,
            // Only deprecate if not already ACTIVE (protect established patterns)
            sql`${knowledgeBase.status} IN ('CANDIDATE', 'SHADOW', 'IN_EXPERIMENT')`,
          ),
        );

      console.log(
        `[FeedbackAPI] Discomfort veto applied for conversation ${conversationId}. Patterns deprecated.`,
      );
    }

    console.log(
      `[FeedbackAPI] Feedback saved: conversation=${conversationId} rating=${rating ?? "n/a"} discomfort=${uncomfortableTopics}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FeedbackAPI] Error saving feedback:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
