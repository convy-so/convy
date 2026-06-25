import { SurveysPageClient } from "@/features/surveys/ui/surveys-page-client";
import { getSurveyListData } from "@/shared/http/page-data";

export default async function SurveysPage() {
  const initialSurveys = await getSurveyListData();
  return <SurveysPageClient initialSurveys={initialSurveys} />;
}
