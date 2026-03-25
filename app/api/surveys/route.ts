import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyBriefs, surveyCreationConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTimeBasedGreeting } from "@/lib/greetings";
import {
  publishPendingOutboxEntries,
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    const rows = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        shareableLink: surveys.shareableLink,
        createdAt: surveys.createdAt,
        updatedAt: surveys.updatedAt,
        currentParticipants: surveys.currentParticipants,
        participantLimit: surveys.participantLimit,
        isVoice: surveys.isVoice,
        programId: surveys.programId,
      })
      .from(surveys)
      .where(
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : and(eq(surveys.userId, session.user.id), isNull(surveys.organizationId)),
      )
      .orderBy(desc(surveys.createdAt));

    const briefs = await getDb()
      .select({
        surveyId: surveyBriefs.surveyId,
        completenessStatus: surveyBriefs.completenessStatus,
        brief: surveyBriefs.brief,
      })
      .from(surveyBriefs);
    const briefBySurveyId = new Map(briefs.map((row) => [row.surveyId, row]));

    return NextResponse.json({
      surveys: rows.map((survey) => ({
        id: survey.id,
        title: survey.title || "Untitled Survey",
        status: survey.status,
        shareableLink: survey.shareableLink,
        responses: survey.currentParticipants,
        completionRate: 0,
        createdAt: survey.createdAt?.toISOString().split("T")[0] || "",
        lastResponse: "Never",
        isOwner: true,
        isVoice: survey.isVoice || false,
        programId: survey.programId,
        coreObjective: briefBySurveyId.get(survey.id)?.brief?.researchGoal || null,
        brief: briefBySurveyId.get(survey.id)?.brief || null,
        briefStatus: briefBySurveyId.get(survey.id)?.completenessStatus || "draft",
      })),
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Error fetching surveys:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = await request.json().catch(() => ({}));
    const surveyId = nanoid();
    const now = new Date();
    const activeOrgId = session.session.activeOrganizationId;

    const language =
      body.language === "fr" ||
      body.language === "de" ||
      body.language === "es" ||
      body.language === "it"
        ? body.language
        : (session.user as any).preferredLanguage || "en";

    const existingSurveys = await getDb()
      .select({ id: surveys.id, isVoice: surveys.isVoice })
      .from(surveys)
      .where(
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : and(eq(surveys.userId, session.user.id), isNull(surveys.organizationId)),
      );

    const isVoice = typeof body.isVoice === "boolean" ? body.isVoice : false;
    if (existingSurveys.length >= 5) {
      return NextResponse.json(
        { error: `Limit reached: You can only have 5 surveys per ${activeOrgId ? "workspace" : "personal account"}` },
        { status: 403 },
      );
    }
    if (isVoice && existingSurveys.filter((item) => item.isVoice).length >= 2) {
      return NextResponse.json(
        { error: `Limit reached: You can only have 2 voice surveys per ${activeOrgId ? "workspace" : "personal account"}` },
        { status: 403 },
      );
    }

    const greeting = getTimeBasedGreeting("creation", language as any) || "Tell me about the education program or learner experience you want to study.";

    let createdSurvey: typeof surveys.$inferSelect | undefined;
    await getDb().transaction(async (tx) => {
      const [inserted] = await tx
        .insert(surveys)
        .values({
          id: surveyId,
          userId: session.user.id,
          organizationId: activeOrgId,
          title: "Untitled Education Study",
          status: "creating",
          language,
          isVoice,
          participantLimit: 50,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      createdSurvey = inserted;

      await tx.insert(surveyCreationConversations).values({
        id: nanoid(),
        surveyId,
        messages: [
          {
            id: nanoid(),
            role: "assistant",
            content: greeting,
            timestamp: now.toISOString(),
          },
        ],
        status: "in_progress",
        collectedInfo: {},
        extractedData: {},
        createdAt: now,
        updatedAt: now,
      });

      if (activeOrgId && inserted) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: activeOrgId,
          eventType: "workspace.survey_created",
          actorId: session.user.id,
          payload: {
            workspaceId: activeOrgId,
            survey: {
              id: inserted.id,
              title: inserted.title,
              status: inserted.status,
              userId: inserted.userId,
              isVoice: inserted.isVoice,
              createdAt: inserted.createdAt?.toISOString() ?? now.toISOString(),
            },
          },
        });
      }
    });

    if (activeOrgId && createdSurvey) {
      await publishPendingOutboxEntries();
    }

    return NextResponse.json({
      ...createdSurvey,
      messages: [
        {
          id: nanoid(),
          role: "assistant",
          content: greeting,
          timestamp: now.toISOString(),
        },
      ],
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return new NextResponse(error.message, { status: 401 });
    }
    console.error("Error creating survey:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
