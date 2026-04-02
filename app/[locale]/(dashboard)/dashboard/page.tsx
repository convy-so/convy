import { Link } from "@/i18n/routing";
import {
  MessageSquare,
  BarChart3,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Sparkles,
  FolderOpen,
  GraduationCap,
} from "lucide-react";
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
import { cache, cacheKeys } from "@/lib/cache";
import { resolvePreferredUiLocale } from "@/lib/i18n/resolve-locale";

type DashboardSurveyStatus =
  | "draft"
  | "active"
  | "completed"
  | "paused"
  | "creating"
  | "archived";

function normalizeDashboardSurveyStatus(status: string | null | undefined): DashboardSurveyStatus {
  switch (status) {
    case "active":
    case "completed":
    case "paused":
    case "creating":
    case "archived":
      return status;
    case "draft":
    default:
      return "draft";
  }
}

async function DashboardContent({ authHeaders }: { authHeaders: Headers | string | null }) {
  const session = await getVerifiedSession(authHeaders);
  const t = await getTranslations("Dashboard");

  const userId = session.user.id;
  const activeOrgId = session.session.activeOrganizationId;
  const language = await resolvePreferredUiLocale(session);

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
      title: "Folders",
      description: "Organize surveys into teacher-friendly folders instead of generic projects.",
      icon: FolderOpen,
      href: "/dashboard/projects",
      color: "from-amber-500 to-orange-500",
    },
    {
      title: "Learning workspace",
      description: "Run classes, topics, student tutoring, and progress tracking.",
      icon: GraduationCap,
      href: "/dashboard/learning",
      color: "from-sky-500 to-blue-500",
    },
  ];

  // Parallelize data fetching and use Redis caching
  const [stats, recentSurveys, activities] = await Promise.all([
    // 1 & 2. Stats
    cache.wrap(
      cacheKeys.dashboardStats(userId, activeOrgId),
      async () => {
        const [surveysCountRes, durationStats] = await Promise.all([
          getDb()
            .select({ count: count() })
            .from(surveys)
            .where(
              activeOrgId
                ? eq(surveys.organizationId, activeOrgId)
                : and(eq(surveys.userId, userId), isNull(surveys.organizationId))
            ),
          getDb()
            .select({
              avgDuration: sql<number>`avg(extract(epoch from ${surveyConversations.updatedAt} - ${surveyConversations.createdAt}))`
            })
            .from(surveyConversations)
            .innerJoin(surveys, eq(surveyConversations.surveyId, surveys.id))
            .where(
                and(
                  eq(surveyConversations.completed, true),
                  activeOrgId
                    ? eq(surveys.organizationId, activeOrgId)
                    : and(eq(surveys.userId, userId), isNull(surveys.organizationId))
                )
            )
        ]);

        const totalSurveys = surveysCountRes[0]?.count || 0;
        const avgSeconds = Math.round(durationStats[0]?.avgDuration || 0);
        const avgMinutes = Math.floor(avgSeconds / 60);
        const remainingSeconds = avgSeconds % 60;
        const durationDisplay = avgSeconds > 0
          ? `${avgMinutes}m ${remainingSeconds}s`
          : "N/A";

        return { totalSurveys, durationDisplay, avgSeconds };
      },
      60 * 5 // Cache for 5 minutes
    ),

    // 3. Recent Surveys
    cache.wrap(
      cacheKeys.dashboardRecentSurveys(userId, activeOrgId),
      async () => {
        const surveysData = await getDb().query.surveys.findMany({
          where: activeOrgId
            ? eq(surveys.organizationId, activeOrgId)
            : and(eq(surveys.userId, userId), isNull(surveys.organizationId)),
          orderBy: [desc(surveys.updatedAt)],
          limit: 3,
        });

        return surveysData.map(survey => ({
          id: survey.id,
          title: survey.title,
          status: survey.status,
          responses: survey.currentParticipants,
          maxResponses: survey.participantLimit,
          updatedAt: survey.updatedAt,
          createdAt: survey.createdAt,
          isVoice: survey.isVoice,
          projectId: survey.projectId,
        }));
      },
      60 * 2 // Cache for 2 minutes
    ),

    // 4. Recent Activity
    cache.wrap(
      cacheKeys.dashboardActivity(userId, activeOrgId),
      async () => {
        const recentActivitiesRaw = await getDb()
          .select({
            id: surveyConversations.id,
            surveyTitle: surveys.title,
            createdAt: surveyConversations.createdAt,
          })
          .from(surveyConversations)
          .innerJoin(surveys, eq(surveyConversations.surveyId, surveys.id))
          .where(
            activeOrgId
              ? eq(surveys.organizationId, activeOrgId)
              : and(eq(surveys.userId, userId), isNull(surveys.organizationId))
          )
          .orderBy(desc(surveyConversations.createdAt))
          .limit(5);

        return recentActivitiesRaw.flatMap((activity) =>
          activity.createdAt
            ? [{
                id: activity.id,
                type: "new_response" as const,
                description: activity.surveyTitle,
                createdAt: activity.createdAt,
              }]
            : [],
        );
      },
      60 * 1 // Cache for 1 minute
    )
  ]);

  // Format data for display using the request locale
  const formattedRecentSurveys = recentSurveys.map(survey => ({
    ...survey,
    status: normalizeDashboardSurveyStatus(survey.status),
    lastActivity: new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(survey.updatedAt)),
    createdAtFormatted: new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(survey.createdAt)),
    projectName: survey.projectId ? "Project" : "Default Project",
  }));

  const formattedActivities = activities.map(activity => ({
    ...activity,
    title: t("Activity.NewResponse"),
    time: new Intl.DateTimeFormat(language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(activity.createdAt)),
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
          value={stats.totalSurveys.toString()}
          change={t("Stats.AllTime")}
          changeType="neutral"
          icon={<MessageSquare className="w-6 h-6" />}
          iconColor="bg-blue-50 text-blue-600"
        />

        <StatsCard
          title={t("Stats.AvgDuration")}
          value={stats.durationDisplay}
          change={stats.avgSeconds > 0 ? t("Stats.PerCompleted") : t("Stats.NoCompletions")}
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
            {formattedRecentSurveys.map((survey) => (
              <SurveyCard key={survey.id} {...survey} createdAt={survey.createdAtFormatted} />
            ))}
          </div>

          {formattedRecentSurveys.length === 0 && (
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
          <ActivityFeed activities={formattedActivities} />
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
