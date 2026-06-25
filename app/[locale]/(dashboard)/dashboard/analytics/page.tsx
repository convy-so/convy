import { Suspense } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Loader2 } from "lucide-react";

import { SurveyAnalyticsDashboardContent } from "./survey-analytics-dashboard-content";

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <AnalyticsContentWrapper params={params} />
    </Suspense>
  );
}

async function AnalyticsContentWrapper({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  const authHeaders = await headers();
  const translations = await getTranslations("AnalyticsPage");

  return (
    <SurveyAnalyticsDashboardContent
      authHeaders={authHeaders}
      translations={translations}
    />
  );
}
