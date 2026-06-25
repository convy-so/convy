import { BarChart3, ChevronRight, MessageSquare, Search } from "lucide-react";
import { and, count, desc, eq } from "drizzle-orm";
import { formatDistanceToNow } from "date-fns";
import type { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import {
  surveyAnalyticsSnapshots,
  surveys,
  surveySessions,
} from "@/shared/db/schema";

type Translate = Awaited<ReturnType<typeof getTranslations>>;
type StatusConfig = {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
};

function getStatusConfig(status: string | null | undefined): StatusConfig {
  switch (status) {
    case "active":
      return {
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        icon: <BarChart3 className="h-6 w-6" />,
      };
    case "creating":
      return {
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        icon: <BarChart3 className="h-6 w-6" />,
      };
    case "completed":
      return {
        color: "text-gray-600",
        bgColor: "bg-gray-100",
        icon: <BarChart3 className="h-6 w-6" />,
      };
    case "paused":
      return {
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        icon: <BarChart3 className="h-6 w-6" />,
      };
    case "draft":
    default:
      return {
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        icon: <BarChart3 className="h-6 w-6" />,
      };
  }
}

export async function SurveyAnalyticsDashboardContent({
  authHeaders,
  translations,
}: {
  authHeaders: Headers | string | null;
  translations: Translate;
}) {
  const session = await getVerifiedSession(authHeaders);

  const userSurveys = await getDb()
    .select({
      id: surveys.id,
      title: surveys.title,
      description: surveys.description,
      status: surveys.status,
      createdAt: surveys.createdAt,
      hasSnapshot: surveyAnalyticsSnapshots.id,
      responseCount: count(surveySessions.id),
    })
    .from(surveys)
    .leftJoin(
      surveySessions,
      and(
        eq(surveySessions.surveyId, surveys.id),
        eq(surveySessions.sessionType, "live"),
      ),
    )
    .leftJoin(
      surveyAnalyticsSnapshots,
      and(
        eq(surveyAnalyticsSnapshots.surveyId, surveys.id),
        eq(surveyAnalyticsSnapshots.isLatest, true),
      ),
    )
    .where(
      and(eq(surveys.userId, session.user.id), eq(surveys.status, "active")),
    )
    .groupBy(
      surveys.id,
      surveys.title,
      surveys.description,
      surveys.status,
      surveys.createdAt,
      surveyAnalyticsSnapshots.id,
    )
    .orderBy(desc(surveys.createdAt));

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-6 font-sans text-slate-900 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {translations("Header.Title")}
            </h1>
            <p className="mt-1 text-gray-500">
              {translations("Header.Description")}
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={translations("Search.Placeholder")}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-11 pr-4 outline-none transition-all focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
          />
        </div>

        <div className="space-y-4">
          {userSurveys.length > 0 ? (
            userSurveys.map((survey) => {
              const statusConfig = getStatusConfig(survey.status);

              return (
                <div
                  key={survey.id}
                  className="rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:border-gray-200"
                >
                  <div className="flex items-center justify-between p-5">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <div
                        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl transition-transform ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        {statusConfig.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/dashboard/surveys/${survey.id}/analytics`}
                          className="inline-block text-lg font-semibold text-gray-900 transition-colors hover:text-blue-600"
                        >
                          {survey.title}
                        </Link>
                        {survey.description ? (
                          <p className="mt-0.5 truncate text-sm text-gray-500">
                            {survey.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <MessageSquare className="h-4 w-4" />
                            {survey.responseCount} {translations("Card.Responses")}
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              survey.hasSnapshot
                                ? "text-emerald-600"
                                : "text-gray-400"
                            }`}
                          >
                            {survey.hasSnapshot
                              ? "Snapshot ready"
                              : "No snapshot yet"}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(survey.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 flex items-center gap-4">
                      <Link
                        href={`/dashboard/surveys/${survey.id}/analytics`}
                        className="text-gray-400 transition-colors hover:text-gray-600"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white py-24 text-center">
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                <BarChart3 className="h-10 w-10" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">
                {translations("Empty.Title")}
              </h3>
              <p className="mx-auto mb-8 max-w-sm text-gray-500">
                {translations("Empty.Description")}
              </p>
              <Link
                href="/dashboard/create"
                className="inline-block rounded-xl bg-black px-8 py-3 font-bold text-white transition-transform duration-200 hover:scale-105"
              >
                {translations("Empty.Button")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
