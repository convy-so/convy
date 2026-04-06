import { NextRequest } from "next/server";
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
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, ...result.data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to update media",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


