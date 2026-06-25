import { SampleReviewPageClient } from "@/features/surveys/ui/sample-review-page-client";
import {
  getSampleConversationInitialData,
  getSurveyDetailsData,
} from "@/shared/http/page-data";

export default async function SampleReviewPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;

  let initialSurveyData = null;
  let initialHistoryData = null;

  try {
    initialSurveyData = await getSurveyDetailsData(surveyId);
    const currentSampleNumber =
      (initialSurveyData.survey.sampleConversationCount || 0) + 1;
    initialHistoryData = await getSampleConversationInitialData(
      surveyId,
      currentSampleNumber,
    );
  } catch {
    initialSurveyData = null;
    initialHistoryData = null;
  }

  return (
    <SampleReviewPageClient
      surveyId={surveyId}
      initialSurveyData={initialSurveyData}
      initialHistoryData={initialHistoryData}
    />
  );
}
