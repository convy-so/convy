import { SurveyDetailPageClient } from "@/features/surveys/ui/survey-detail-page-client";
import { getSurveyDetailsData } from "@/shared/http/page-data";

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
