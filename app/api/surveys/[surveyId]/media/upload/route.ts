import { NextRequest } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { uploadSurveyMediaAction } from "@/app/actions/survey-media";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  const { surveyId } = await params;
  try {
    const formData = await request.formData();
    formData.set("surveyId", surveyId);
    const result = await uploadSurveyMediaAction(formData);

    if (!result.success) { return apiError("VALIDATION_ERROR", result.error); }

    return new Response(JSON.stringify({ success: true, ...result.data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) { return apiUnhandledError(error, "Failed to upload media", "/api/surveys/[surveyId]/media/upload:post"); }
}


