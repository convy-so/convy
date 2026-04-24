import { NextRequest } from "next/server";
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

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, ...result.data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[uploadMedia] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to upload media",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

