import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { buildRefinementAssistantResponse } from "@/lib/education/refinement";
import {
  appendRefinementMessage,
  createRefinementProposal,
  getOrCreateRefinementThread,
  getResearchBrief,
  listRefinementMessages,
  listRefinementProposals,
} from "@/lib/education/storage";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
import type { ChatMessage } from "@/lib/chat-types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const thread = await getOrCreateRefinementThread({
      surveyId,
      createdBy: session.user.id,
    });

    const [messages, proposals] = await Promise.all([
      listRefinementMessages(thread.id),
      listRefinementProposals(thread.id),
    ]);

    return NextResponse.json({
      thread,
      messages,
      proposals,
      activeConductingProfile: null,
      activeResearchBriefPatch: null,
    });
  } catch (error) { return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/refinement:get"); }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const body = await req.json();
    const content = String(body.content || "").trim();
    if (!content) { return apiError("VALIDATION_ERROR", "content is required"); }

    const [briefRow, latestSample] = await Promise.all([
      getResearchBrief(surveyId),
      getDb()
        .select()
        .from(sampleConversations)
        .where(eq(sampleConversations.surveyId, surveyId))
        .orderBy(desc(sampleConversations.conversationNumber))
        .then((rows) => rows[0]),
    ]);
    if (!briefRow) { return apiError("VALIDATION_ERROR", "Survey brief is not ready."); }

    const thread = await getOrCreateRefinementThread({
      surveyId,
      createdBy: session.user.id,
      sampleConversationId: latestSample?.id ?? null,
    });

    await appendRefinementMessage({
      threadId: thread.id,
      role: "user",
      content,
    });

    const transcript = Array.isArray(latestSample?.messages)
      ? latestSample.messages
          .map((message: ChatMessage) => `${message.role}: ${message.content}`)
          .join("\n\n")
      : "";
    const assistantResult = await buildRefinementAssistantResponse({
      creatorMessage: content,
      surveyTitle: survey.title || briefRow.brief.title,
      latestSampleTranscript: transcript,
      brief: briefRow.brief,
    });

    await appendRefinementMessage({
      threadId: thread.id,
      role: "assistant",
      content: assistantResult.reply,
    });

    const savedProposals = await Promise.all(
      assistantResult.proposals.map((proposal) =>
        createRefinementProposal({
          threadId: thread.id,
          surveyId,
          proposal,
        }),
      ),
    );

    return NextResponse.json({
      reply: assistantResult.reply,
      proposals: savedProposals,
    });
  } catch (error) { return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/refinement:post"); }
}

