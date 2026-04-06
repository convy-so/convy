import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildRefinementAssistantResponse } from "@/lib/education/playbook-workflow";
import { getPersonalityPreset } from "@/lib/education/playbooks";
import {
  appendRefinementMessage,
  createRefinementProposal,
  getActivePersonalityAssignment,
  getOrCreateRefinementThread,
  getResearchBrief,
  listPlaybooksForSurvey,
  listRefinementMessages,
  listRefinementProposals,
} from "@/lib/education/storage";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import type { ChatMessage } from "@/lib/chat-types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const thread = await getOrCreateRefinementThread({
      surveyId,
      createdBy: session.user.id,
    });

    const [messages, proposals, playbooks, personality] = await Promise.all([
      listRefinementMessages(thread.id),
      listRefinementProposals(thread.id),
      listPlaybooksForSurvey({ surveyId, organizationId: survey.organizationId }),
      getActivePersonalityAssignment(surveyId, "sample"),
    ]);

    return NextResponse.json({
      thread,
      messages,
      proposals,
      activePlaybooks: playbooks,
      activePersonality: personality?.assignment ?? null,
    });
  } catch (error) {
    console.error("[Refinement GET] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const content = String(body.content || "").trim();
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const [briefRow, latestSample, personality, playbooks] = await Promise.all([
      getResearchBrief(surveyId),
      getDb()
        .select()
        .from(sampleConversations)
        .where(eq(sampleConversations.surveyId, surveyId))
        .orderBy(desc(sampleConversations.conversationNumber))
        .then((rows) => rows[0]),
      getActivePersonalityAssignment(surveyId, "sample"),
      listPlaybooksForSurvey({ surveyId, organizationId: survey.organizationId }),
    ]);
    if (!briefRow) {
      return NextResponse.json({ error: "Survey brief is not ready." }, { status: 400 });
    }

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
    const activePreset = getPersonalityPreset(personality?.assignment.presetId);
    const assistantResult = await buildRefinementAssistantResponse({
      creatorMessage: content,
      surveyTitle: survey.title || briefRow.brief.title,
      currentPersonalityLabel: activePreset.label,
      playbookSummaries: playbooks
        .filter((record) => record.activeVersion)
        .map((record) => `${record.playbook.name}: ${record.activeVersion!.interpretation.summary}`),
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
  } catch (error) {
    console.error("[Refinement POST] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
