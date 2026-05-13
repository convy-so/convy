import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { CreateSurveyPageClient } from "@/components/surveys/pages/create-survey-page-client";
import {
  getCurrentUiLocaleValue,
  getSurveyCreationInitialData,
  getSurveyDetailsData,
} from "@/lib/server/app-queries";

export default async function CreateSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ id?: string; surveyId?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const requestedSurveyId = query.id ?? query.surveyId ?? null;
  const initialLanguage = await getCurrentUiLocaleValue();

  let initialSurveyId: string | null = null;
  let initialCreationState = null;
  let initialSurveyData = null;

  if (requestedSurveyId) {
    try {
      [initialCreationState, initialSurveyData] = await Promise.all([
        getSurveyCreationInitialData(requestedSurveyId),
        getSurveyDetailsData(requestedSurveyId),
      ]);
      initialSurveyId = requestedSurveyId;
    } catch {
      initialSurveyId = null;
      initialCreationState = null;
      initialSurveyData = null;
    }
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <CreateSurveyPageClient
        locale={locale}
        initialLanguage={initialLanguage}
        initialSurveyId={initialSurveyId}
        initialCreationState={initialCreationState}
        initialSurveyData={initialSurveyData}
      />
    </Suspense>
  );
}
