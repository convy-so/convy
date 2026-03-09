import { Link } from "@/i18n/routing";
import {
  MessageSquare,
  BarChart3,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import { SupportedLanguage } from "@/lib/i18n/ai-translator";
import { StatsCard } from "@/components/dashboard/stats-card";
import { SurveyCard } from "@/components/dashboard/survey-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { surveys, surveyConversations } from "@/db/schema/surveys";
import { eq, desc, count, and, sql, isNull } from "drizzle-orm";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Loader2 } from "lucide-react";

async function DashboardContent({ authHeaders }: { authHeaders: Headers | string | null }) {
  const session = await getVerifiedSession(authHeaders);
  const t = await getTranslations("Dashboard");

  const userId = session.user.id;
  const activeOrgId = session.session.activeOrganizationId;
  const language = (session.user as any).preferredLanguage as SupportedLanguage || "en";

  const quickActions = [
    {
      title: t("QuickActions.CreateSurvey.Title"),
      description: t("QuickActions.CreateSurvey.Description"),
      icon: Sparkles,
      href: "/dashboard/create",
      color: "from-blue-500 to-cyan-500",
    },
    {
      title: t("QuickActions.ViewAnalytics.Title"),
      description: t("QuickActions.ViewAnalytics.Description"),
      icon: BarChart3,
      href: "/dashboard/analytics",
      color: "from-purple-500 to-pink-500",
    },
    {
      title: t("QuickActions.ManageProjects.Title"),
      description: t("QuickActions.ManageProjects.Description"),
      icon: FolderOpen,
      href: "/dashboard/projects",
      color: "from-amber-500 to-orange-500",
    },
  ];

  // 1. Fetch Stats
  const [surveysCountRes] = await getDb()
    .select({ count: count() })
    .from(surveys)
    .where(
      and(
        eq(surveys.userId, userId),
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : isNull(surveys.organizationId)
      )
    );
  const totalSurveys = surveysCountRes?.count || 0;

  // 2. Fetch Average Duration
  const [durationStats] = await getDb()
    .select({
      avgDuration: sql<number>`avg(extract(epoch from ${surveyConversations.updatedAt} - ${surveyConversations.createdAt}))`
    })
    .from(surveyConversations)
    .innerJoin(surveys, eq(surveyConversations.surveyId, surveys.id))
    .where(
      and(
        eq(surveys.userId, userId),
        eq(surveyConversations.completed, true),
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : isNull(surveys.organizationId)
      )
    );

  const avgSeconds = Math.round(durationStats?.avgDuration || 0);
  const avgMinutes = Math.floor(avgSeconds / 60);
  const remainingSeconds = avgSeconds % 60;
  const durationDisplay = avgSeconds > 0
    ? `${avgMinutes}m ${remainingSeconds}s`
    : "N/A";

  // 3. Fetch Recent Surveys
  const recentSurveysData = await getDb().query.surveys.findMany({
    where: and(
      eq(surveys.userId, userId),
      activeOrgId
        ? eq(surveys.organizationId, activeOrgId)
        : isNull(surveys.organizationId)
    ),
    orderBy: [desc(surveys.updatedAt)],
    limit: 3,
  });

  const recentSurveys = recentSurveysData.map(survey => ({
    id: survey.id,
    title: survey.title,
    status: survey.status as any,
    responses: survey.currentParticipants,
    maxResponses: survey.participantLimit,
    lastActivity: new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(survey.updatedAt)),
    createdAt: new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(survey.createdAt)),
    isVoice: survey.isVoice,
    projectName: survey.projectId ? "Project" : "Default Project", // Simplified for now, but should be fetched
  }));

  // 4. Fetch Recent Activity
  const recentActivitiesRaw = await getDb()
    .select({
      id: surveyConversations.id,
      title: sql<string>`'New response'`,
      surveyTitle: surveys.title,
      createdAt: surveyConversations.createdAt,
    })
    .from(surveyConversations)
    .innerJoin(surveys, eq(surveyConversations.surveyId, surveys.id))
    .where(
      and(
        eq(surveys.userId, userId),
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : isNull(surveys.organizationId)
      )
    )
    .orderBy(desc(surveyConversations.createdAt))
    .limit(5);

  const activities = recentActivitiesRaw.map(activity => ({
    id: activity.id,
    type: "new_response" as const,
    title: t("Activity.NewResponse"),
    description: activity.surveyTitle,
    time: new Intl.DateTimeFormat(language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(activity.createdAt!)),
  }));

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#111111] tracking-tight">
            {t("Welcome.Title")}
          </h1>
          <p className="text-[#666666] mt-1 lg:mt-2 text-sm lg:text-base">
            {t("Welcome.Subtitle")}
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors group w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          {t("CreateSurvey")}
          <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatsCard
          title={t("Stats.TotalSurveys")}
          value={totalSurveys.toString()}
          change={t("Stats.AllTime")}
          changeType="neutral"
          icon={<MessageSquare className="w-6 h-6" />}
          iconColor="bg-blue-50 text-blue-600"
        />

        <StatsCard
          title={t("Stats.AvgDuration")}
          value={durationDisplay}
          change={avgSeconds > 0 ? t("Stats.PerCompleted") : t("Stats.NoCompletions")}
          changeType="neutral"
          icon={<TrendingUp className="w-6 h-6" />}
          iconColor="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all duration-300"
          >
            <div
              className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
            >
              <action.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{action.title}</h3>
            <p className="text-sm text-gray-500">{action.description}</p>
          </Link>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t("RecentSurveys.Title")}</h2>
            <Link
              href="/dashboard/surveys"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              {t("RecentSurveys.ViewAll")}
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {recentSurveys.map((survey) => (
              <SurveyCard key={survey.id} {...survey} />
            ))}
          </div>

          {recentSurveys.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("RecentSurveys.NoSurveys")}</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                {t("RecentSurveys.GetStarted")}
              </p>
              <Link
                href="/dashboard/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("RecentSurveys.CreateFirst")}
              </Link>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <ActivityFeed activities={activities} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <DashboardContentWrapper />
    </Suspense>
  );
}

async function DashboardContentWrapper() {
  const authHeaders = await headers();
  return <DashboardContent authHeaders={authHeaders} />;
}
