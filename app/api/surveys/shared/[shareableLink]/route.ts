import { NextResponse } from "next/server";

import { fetchActiveSurveyByShareableLink } from "@/lib/surveys/public-survey-access";

/**
 * Get a survey by its shareable link (public endpoint)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;

    const surveyResult = await fetchActiveSurveyByShareableLink(shareableLink);
    if ("error" in surveyResult) {
      return NextResponse.json(
        { error: surveyResult.error.message },
        { status: surveyResult.error.status },
      );
    }

    const survey = {
      id: surveyResult.survey.id,
      title: surveyResult.survey.title,
      programId: surveyResult.survey.programId,
      coreObjective: surveyResult.survey.coreObjective,
      status: surveyResult.survey.status,
      currentParticipants: surveyResult.survey.currentParticipants,
      participantLimit: surveyResult.survey.participantLimit,
    };

    return NextResponse.json({
      survey,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
