import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { eq, desc, count, and, isNull } from "drizzle-orm";
import { Link } from "@/i18n/routing";
import {
  Search,
  ChevronRight,
  BarChart3,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

async function AnalyticsContent({ authHeaders }: { authHeaders: Headers | string | null }) {
  const session = await getVerifiedSession(authHeaders);
  const t = await getTranslations("AnalyticsPage");

  const activeOrgId = session.session.activeOrganizationId;

  const userSurveys = await getDb()
    .select({
      id: surveys.id,
      title: surveys.title,
      description: surveys.description,
      status: surveys.status,
      createdAt: surveys.createdAt,
      _count: {
        conversations: count(surveyConversations.id)
      }
    })
    .from(surveys)
    .leftJoin(surveyConversations, eq(surveyConversations.surveyId, surveys.id))
    .where(
      and(
        eq(surveys.userId, session.user.id),
        eq(surveys.status, 'active'),
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : isNull(surveys.organizationId)
      )
    )
    .groupBy(surveys.id, surveys.title, surveys.description, surveys.status, surveys.createdAt)
    .orderBy(desc(surveys.createdAt));

  const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ReactNode }> = {
    active: { color: "text-emerald-600", bgColor: "bg-emerald-50", icon: <BarChart3 className="w-6 h-6" /> },
    draft: { color: "text-amber-600", bgColor: "bg-amber-50", icon: <BarChart3 className="w-6 h-6" /> },
    creating: { color: "text-blue-600", bgColor: "bg-blue-50", icon: <BarChart3 className="w-6 h-6" /> },
    completed: { color: "text-gray-600", bgColor: "bg-gray-100", icon: <BarChart3 className="w-6 h-6" /> },
    paused: { color: "text-orange-600", bgColor: "bg-orange-50", icon: <BarChart3 className="w-6 h-6" /> },
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-6 sm:p-8 lg:p-10 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t("Header.Title")}</h1>
            <p className="text-gray-500 mt-1">{t("Header.Description")}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t("Search.Placeholder")}
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none transition-all"
          />
        </div>

        {/* Survey List */}
        <div className="space-y-4">
          {userSurveys.length > 0 ? (
            userSurveys.map((survey) => {
              const config = statusConfig[survey.status as string] || statusConfig.draft;

              return (
                <div
                  key={survey.id}
                  className="bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-all duration-300"
                >
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {/* Icon Container */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${config.bgColor} ${config.color}`}>
                        {config.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/dashboard/surveys/${survey.id}/analytics`}
                          className="font-semibold text-gray-900 text-lg hover:text-blue-600 transition-colors inline-block"
                        >
                          {survey.title}
                        </Link>
                        {survey.description && (
                          <p className="text-sm text-gray-500 mt-0.5 truncate">
                            {survey.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4" />
                            {survey._count?.conversations || 0} {t("Card.Responses")}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(survey.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 ml-4">
                      <Link
                        href={`/dashboard/surveys/${survey.id}/analytics`}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-24 text-center bg-white rounded-2xl border border-gray-100">
              <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
                <BarChart3 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t("Empty.Title")}</h3>
              <p className="text-gray-500 mb-8 max-w-sm mx-auto">{t("Empty.Description")}</p>
              <Link href="/dashboard/create" className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:scale-105 transition-transform duration-200 inline-block">
                {t("Empty.Button")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <AnalyticsContentWrapper params={params} />
    </Suspense>
  );
}

async function AnalyticsContentWrapper({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  const authHeaders = await headers();
  return <AnalyticsContent authHeaders={authHeaders} />;
}
