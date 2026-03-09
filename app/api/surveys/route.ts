import { eq, desc, and, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getTimeBasedGreeting } from "@/lib/greetings";

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
        and(
          eq(surveys.userId, session.user.id),
          activeOrgId
            ? eq(surveys.organizationId, activeOrgId)
            : isNull(surveys.organizationId),
        ),
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
      expertState: survey.expertState,
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

    let survey;
    await getDb().transaction(async (tx) => {
      const [insertedSurvey] = await tx
        .insert(surveys)
        .values({
          id: surveyId,
          userId: session.user.id,
          organizationId: session.session.activeOrganizationId,
          title: "Untitled Survey",
          status: "creating",
          language: language,
          isVoice: typeof body.isVoice === "boolean" ? body.isVoice : false,
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
