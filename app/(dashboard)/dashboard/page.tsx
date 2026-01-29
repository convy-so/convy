
import Link from "next/link";
import {
  MessageSquare,
  Users,
  BarChart3,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Sparkles,
  FolderOpen,
  Plug,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { SurveyCard } from "@/components/dashboard/survey-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema/surveys";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { IntegrationsWidget } from "@/components/dashboard/integrations-widget";
import { getSlackIntegrationStatus } from "@/app/actions/slack";
import { getNotionIntegrationStatus } from "@/app/actions/notion";
import { getZapierIntegrationStatus } from "@/app/actions/zapier";

const quickActions = [
  {
    title: "Create Survey",
    description: "Build AI-powered forms",
    icon: Sparkles,
    href: "/dashboard/create",
    color: "from-blue-500 to-cyan-500",
  },
  {
    title: "View Analytics",
    description: "Insights & reports",
    icon: BarChart3,
    href: "/dashboard/analytics",
    color: "from-purple-500 to-pink-500",
  },
  {
    title: "Manage Projects",
    description: "Organize your surveys",
    icon: FolderOpen,
    href: "/dashboard/projects",
    color: "from-amber-500 to-orange-500",
  },
  {
    title: "Manage Projects",
    description: "Organize your surveys",
    icon: FolderOpen,
    href: "/dashboard/projects",
    color: "from-amber-500 to-orange-500",
  },
];

export default async function DashboardPage() {
  const session = await getVerifiedSession();
  const userId = session.user.id;

  // 1. Fetch Stats
  // Total Surveys
  const [surveysCountRes] = await db
    .select({ count: count() })
    .from(surveys)
    .where(eq(surveys.userId, userId));
  const totalSurveys = surveysCountRes?.count || 0;

  // Total Responses & Completed Responses
  const [responsesStats] = await db
    .select({
      total: count(),
      completed: sql<number>`sum(case when ${surveyConversations.completed} = true then 1 else 0 end)`,
    })
    .from(surveyConversations)
    .innerJoin(surveys, eq(surveyConversations.surveyId, surveys.id))
    .where(eq(surveys.userId, userId));

  const totalResponses = responsesStats?.total || 0;
  const completedResponses = Number(responsesStats?.completed || 0);
  const completionRate = totalResponses > 0 ? Math.round((completedResponses / totalResponses) * 100) : 0;

  // 2. Fetch Recent Surveys
  const recentSurveysData = await db.query.surveys.findMany({
    where: eq(surveys.userId, userId),
    orderBy: [desc(surveys.updatedAt)],
    limit: 3,
  });

  const recentSurveys = recentSurveysData.map(survey => ({
    id: survey.id,
    title: survey.title,
    status: survey.status as any, // Cast to match component type
    responses: survey.currentParticipants,
    maxResponses: survey.participantLimit,
    lastActivity: new Date(survey.updatedAt).toLocaleDateString(), // simplified
    createdAt: new Date(survey.createdAt).toLocaleDateString(),
    isVoice: survey.isVoice,
    projectName: "Default Project", // Placeholder if project relation not fetched
  }));

  // 3. Fetch Recent Activity (Responses)
  const recentActivitiesRaw = await db
    .select({
      id: surveyConversations.id,
      title: sql<string>`'New response'`,
      surveyTitle: surveys.title,
      createdAt: surveyConversations.createdAt,
    })
    .from(surveyConversations)
    .innerJoin(surveys, eq(surveyConversations.surveyId, surveys.id))
    .where(eq(surveys.userId, userId))
    .orderBy(desc(surveyConversations.createdAt))
    .limit(5);

  const activities = recentActivitiesRaw.map(activity => ({
    id: activity.id,
    type: "new_response" as const,
    title: "New response received",
    description: activity.surveyTitle,
    time: new Date(activity.createdAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
  }));

  // 4. Fetch Integration Status
  const [slackStatus, notionStatus, zapierStatus] = await Promise.all([
    getSlackIntegrationStatus(),
    getNotionIntegrationStatus(),
    getZapierIntegrationStatus(),
  ]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Welcome back! 👋
          </h1>
          <p className="text-gray-500 mt-1">
            Here's what's happening with your surveys today.
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors group w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          Create Survey
          <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatsCard
          title="Total Surveys"
          value={totalSurveys.toString()}
          change="All time"
          changeType="neutral"
          icon={<MessageSquare className="w-6 h-6" />}
          iconColor="bg-blue-50 text-blue-600"
        />
        <StatsCard
          title="Total Responses"
          value={totalResponses.toLocaleString()}
          change="All time"
          changeType="neutral"
          icon={<Users className="w-6 h-6" />}
          iconColor="bg-purple-50 text-purple-600"
        />
        <StatsCard
          title="Completion Rate"
          value={`${completionRate}%`}
          change={`${completedResponses} completed`}
          changeType="neutral"
          icon={<BarChart3 className="w-6 h-6" />}
          iconColor="bg-emerald-50 text-emerald-600"
        />
        <StatsCard
          title="Avg. Duration"
          value="N/A"
          change="Coming soon"
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
        {/* Recent Surveys - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Surveys</h2>
            <Link
              href="/dashboard/surveys"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {recentSurveys.map((survey) => (
              <SurveyCard key={survey.id} {...survey} />
            ))}
          </div>

          {/* Empty state for when there are no surveys */}
          {recentSurveys.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No surveys yet</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                Get started by creating your first AI-powered survey
              </p>
              <Link
                href="/dashboard/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Your First Survey
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar Column - Activity Feed & Integrations */}
        <div className="lg:col-span-1 space-y-6">
          <IntegrationsWidget
            slackConnected={slackStatus.success && slackStatus.data.connected}
            notionConnected={notionStatus.success && notionStatus.connected}
            zapierConnected={zapierStatus.success && zapierStatus.data.connected}
          />
          <ActivityFeed activities={activities} />
        </div>
      </div>
    </div>
  );
}