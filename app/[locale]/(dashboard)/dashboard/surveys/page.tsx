import { SurveysPageClient } from "@/components/surveys/pages/surveys-page-client";
import { getSurveyListData } from "@/lib/server/app-queries";

export default async function SurveysPage() {
  const initialSurveys = await getSurveyListData();
  return <SurveysPageClient initialSurveys={initialSurveys} />;
}
