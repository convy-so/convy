import { NextRequest } from "next/server";
import { removeSurveyMediaAction } from "@/app/actions/survey-media";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  const { surveyId } = await params;
  try {
    const body = await request.json();
    const result = await removeSurveyMediaAction({
      ...body,
      surveyId,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to remove media",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

