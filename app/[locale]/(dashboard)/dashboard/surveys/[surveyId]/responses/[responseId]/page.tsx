import { ResponseDetailPageClient } from "@/components/surveys/pages/response-detail-page-client";
import { getSurveyResponseDetailData } from "@/lib/server/app-queries";

export default async function ResponseDetailPage({
  params,
}: {
  params: Promise<{ surveyId: string; responseId: string }>;
}) {
  const { surveyId, responseId } = await params;

  let initialResponse = null;
  let initialError: string | null = null;

  try {
    initialResponse = await getSurveyResponseDetailData(surveyId, responseId);
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Failed to load session data";
  }

  return (
    <ResponseDetailPageClient
      surveyId={surveyId}
      initialResponse={initialResponse}
      initialError={initialError}
    />
  );
}
