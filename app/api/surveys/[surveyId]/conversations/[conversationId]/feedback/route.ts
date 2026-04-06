/**
 * POST /api/surveys/[surveyId]/conversations/[conversationId]/feedback
 *
 * Participant micro-rating submitted at the end of a survey conversation.
 * Anonymous respondents must present a valid survey session.
 *
 * Body: { rating?: 1-5, feltNatural?: bool, uncomfortableTopics?: bool, freeText?: string }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";

import { getDb } from "@/db";
import { surveyConversations, participantFeedback } from "@/db/schema";
import { resolveRespondentAccess } from "@/lib/privacy/respondent";
import { getClientIP } from "@/lib/ratelimit";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  feltNatural: z.boolean().optional(),
  uncomfortableTopics: z.boolean().optional().default(false),
  freeText: z.string().max(1000).optional(),
  respondentToken: z.string().min(1).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string; conversationId: string }> }
) {
  try {
    const { surveyId, conversationId } = await params;

    // Verify conversation belongs to the survey
    const [conv] = await getDb()
      .select({ id: surveyConversations.id, surveyId: surveyConversations.surveyId })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.id, conversationId),
          eq(surveyConversations.surveyId, surveyId)
        )
      )
      .limit(1);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Parse + validate body
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { rating, feltNatural, uncomfortableTopics, freeText, respondentToken } = parsed.data;

    const tokenRecord = await resolveRespondentAccess({
      cookieHeader: request.headers.get("cookie"),
      surveyId,
      conversationId,
      explicitToken: respondentToken ?? null,
      sessionAllowedScopes: ["respondent_session"],
      explicitAllowedScopes: [
        "respondent_resume",
        "respondent_self_service",
        "respondent_session",
      ],
      clientIp: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });
    if (!tokenRecord) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Insert feedback record
    await getDb().insert(participantFeedback).values({
      id: nanoid(),
      conversationId,
      surveyId,
      rating: rating ?? null,
      feltNatural: feltNatural ?? null,
      uncomfortableTopics: uncomfortableTopics ?? false,
      freeText: freeText ?? null,
    });


    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

