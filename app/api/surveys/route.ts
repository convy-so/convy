import { getDb } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getTimeBasedGreeting } from "@/lib/greetings";

import { getSurveysAction } from "@/app/actions/survey";

/**
 * Get all surveys for the authenticated user
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const search = searchParams.get("search")?.trim() || undefined;
    const status = searchParams.get("status") || "all";

    const result = await getSurveysAction({ page, pageSize, search, status });

    if (!result.success) {
      if (
        result.error === "UNAUTHENTICATED" ||
        result.error === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: result.error }, { status: 401 });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { surveys: userSurveys, total } = result.data;

    const formattedSurveys = userSurveys.map((survey) => ({
      id: survey.id,
      title: survey.title || "Untitled Survey",
      status: survey.status,
      shareableLink: survey.shareableLink,
      responses: survey.currentParticipants,
      completionRate: 0,
      createdAt: survey.createdAt?.toISOString().split("T")[0] || "",
      lastResponse: "Never",
      isOwner: survey.isOwner,
      isVoice: survey.isVoice || false,
      expertState: survey.expertState,
    }));

    return NextResponse.json({ surveys: formattedSurveys, total });
  } catch (error) {
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
        : (session?.user as { preferredLanguage?: string })
            ?.preferredLanguage || "en";

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

      const initialGreeting = getTimeBasedGreeting(
        "creation",
        language as "en" | "fr" | "de" | "es" | "it",
      );

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
