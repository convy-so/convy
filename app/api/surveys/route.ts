import { eq, desc, and, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getTimeBasedGreeting } from "@/lib/greetings";
import { publishWorkspaceEvent } from "@/lib/redis-events";

/**
 * Get all surveys for the authenticated user
 */
export async function GET() {
  try {
    const session = await getVerifiedSession();

    const activeOrgId = session.session.activeOrganizationId;

    const userSurveys = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        shareableLink: surveys.shareableLink,
        createdAt: surveys.createdAt,
        updatedAt: surveys.updatedAt,
        currentParticipants: surveys.currentParticipants,
        participantLimit: surveys.participantLimit,
        expertState: surveys.expertState,
        isVoice: surveys.isVoice,
      })
      .from(surveys)
      .where(
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : and(eq(surveys.userId, session.user.id), isNull(surveys.organizationId)),
      )
      .orderBy(desc(surveys.createdAt));

    const formattedSurveys = userSurveys.map((survey) => ({
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
      expertState: survey.expertState as any,
    }));

    return NextResponse.json({ surveys: formattedSurveys });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("Error fetching surveys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();

    // Create a new survey draft
    const surveyId = nanoid();
    const now = new Date();

    // Validate language
    const body = await request.json();
    const language =
      body.language === "fr" ||
      body.language === "de" ||
      body.language === "es" ||
      body.language === "it"
        ? body.language
        : (session.user as any).preferredLanguage || "en";

    const domainId = typeof body.domainId === "number" ? body.domainId : null;
    const activeOrgId = session.session.activeOrganizationId;

    // --- USAGE LIMITS CHECK ---
    const existingSurveys = await getDb()
      .select({
        id: surveys.id,
        isVoice: surveys.isVoice,
      })
      .from(surveys)
      .where(
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : and(eq(surveys.userId, session.user.id), isNull(surveys.organizationId)),
      );

    const isVoice = typeof body.isVoice === "boolean" ? body.isVoice : false;

    if (existingSurveys.length >= 5) {
      return NextResponse.json(
        {
          error:
            "Limit reached: You can only have 5 surveys per " +
            (activeOrgId ? "workspace" : "personal account"),
        },
        { status: 403 },
      );
    }

    if (isVoice && existingSurveys.filter((s) => s.isVoice).length >= 2) {
      return NextResponse.json(
        {
          error:
            "Limit reached: You can only have 2 voice surveys per " +
            (activeOrgId ? "workspace" : "personal account"),
        },
        { status: 403 },
      );
    }
    // --- END USAGE LIMITS CHECK ---

    let survey: typeof surveys.$inferSelect | undefined;
    await getDb().transaction(async (tx) => {
      const [insertedSurvey] = await tx
        .insert(surveys)
        .values({
          id: surveyId,
          userId: session.user.id,
          organizationId: activeOrgId,
          title: "Untitled Survey",
          status: "creating",
          language: language,
          isVoice: isVoice,
          participantLimit: 50, // Force 50 respondent limit
          domainId: domainId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      survey = insertedSurvey;

      const initialGreeting = getTimeBasedGreeting("creation", language as any);

      await tx.insert(surveyCreationConversations).values({
        id: crypto.randomUUID(),
        surveyId: surveyId,
        messages: [
          {
            id: nanoid(),
            role: "assistant",
            content: initialGreeting,
            timestamp: new Date().toISOString(),
          },
        ],
        status: "in_progress",
        extractedData: domainId ? { domainId } : {},
        collectedInfo: {
          objective: false,
          targetAudience: false,
          scope: false,
          successCriteria: false,
          constraints: false,
          hypotheses: false,
          tone: false,
          requiredQuestions: false,
          metrics: false,
          personalInfo: false,
          subjectDefined: false,
          domainIdentified: false,
          media: false,
          subjectModelComplete: false,
        },
      });
    });

    // Invalidate dashboard cache for the workspace/user
    if (survey) {
      const { cache, cacheKeys } = await import("@/lib/cache");
      await Promise.all([
        cache.delete(cacheKeys.dashboardStats(session.user.id, activeOrgId)),
        cache.delete(cacheKeys.dashboardRecentSurveys(session.user.id, activeOrgId)),
      ]).catch(err => console.error("Failed to invalidate dashboard cache:", err));
    }

    // Publish event for real-time synchronization if in a workspace
    if (activeOrgId && survey) {
      publishWorkspaceEvent({
        type: "SURVEY_CREATED",
        workspaceId: activeOrgId,
        userId: session.user.id,
        userName: session.user.name,
        data: {
          id: survey!.id,
          title: survey!.title as string,
          status: survey!.status,
          isVoice: survey!.isVoice as boolean,
          createdAt: survey!.createdAt,
        },
        timestamp: now.toISOString(),
      }).catch((err) => console.error("Failed to publish survey creation event:", err));
    }

    return NextResponse.json(survey);
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new NextResponse(error.message, { status: 401 });
      }
    }
    console.error("Error creating survey:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
