import { NextRequest } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { updateSurveyMediaAction } from "@/app/actions/survey-media";

// export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await params;
  try {
    const body = await request.json();
    const result = await updateSurveyMediaAction({
      ...body,
      surveyId,
    });

    if (!result.success) { 
      return apiError("VALIDATION_ERROR", result.error.message || "Failed to update media", { details: result.error.details }); 
    }

    return new Response(JSON.stringify({ success: true, ...result.data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) { 
    return apiUnhandledError(error, "Failed to update media", "/api/surveys/[surveyId]/media/update:post"); 
  }
}
