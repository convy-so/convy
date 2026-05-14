import { SurveyDetailPageClient } from "@/components/surveys/pages/survey-detail-page-client";
import { getSurveyDetailsData } from "@/lib/server/app-queries";

export default async function SurveyDetailPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;

  let initialSurveyData = null;
  let initialErrorStatus: number | null = null;

  try {
    initialSurveyData = await getSurveyDetailsData(surveyId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load survey";
    initialErrorStatus =
      message === "Unauthorized"
        ? 403
        : message === "Survey not found"
          ? 404
          : 500;
  }

  return (
    <SurveyDetailPageClient
      surveyId={surveyId}
      initialSurveyData={initialSurveyData}
      initialErrorStatus={initialErrorStatus}
    />
  );
}
