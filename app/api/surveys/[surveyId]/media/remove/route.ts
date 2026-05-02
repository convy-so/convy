import { NextRequest } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
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
      return apiError("VALIDATION_ERROR", result.error.message || "Failed to remove media", { details: result.error.details }); 
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) { 
    return apiUnhandledError(error, "Failed to remove media", "/api/surveys/[surveyId]/media/remove:post"); 
  }
}
