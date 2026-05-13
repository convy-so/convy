import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { Link, redirect } from "@/i18n/routing";
import {
  getSurveyAnalyticsInitialData,
  getSurveyDetailsData,
} from "@/lib/server/app-queries";

export default async function SurveyAnalyticsPage({
  params,
}: {
  params: Promise<{ surveyId: string; locale: string }>;
}) {
  const { surveyId, locale } = await params;
  const t = await getTranslations({ locale, namespace: "SurveyAnalytics" });

  let initialData = undefined;

  try {
    const [surveyData, analyticsData] = await Promise.all([
      getSurveyDetailsData(surveyId),
      getSurveyAnalyticsInitialData(surveyId, locale),
    ]);

    if (surveyData.survey.status !== "active") {
      redirect({ href: "/dashboard/analytics", locale });
    }

    initialData = analyticsData;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load analytics";

    if (message === "Unauthorized" || message === "Survey not found") {
      redirect({ href: "/dashboard/analytics", locale });
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/analytics"
          className="rounded-full p-2 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {t("Title")}
          </h1>
          <p className="text-sm text-gray-500">{t("Subtitle")}</p>
        </div>
      </div>

      <AnalyticsDashboard surveyId={surveyId} initialData={initialData} />
    </div>
  );
}
