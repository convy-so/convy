import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  FolderOpen,
  GraduationCap,
  MessageSquare,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { count, desc, eq } from "drizzle-orm";
import type { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { getVerifiedSession } from "@/features/auth/public-server";
import { SurveyCard } from "@/features/surveys/creator/ui/survey-card";
import { getDb } from "@/shared/db";
import {
  classroomStudents,
  classrooms,
  learningTopics,
} from "@/shared/db/schema/learning";
import { surveyConversations, surveys } from "@/shared/db/schema/surveys";
import { cache, cacheKeys } from "@/shared/infra/cache";
import { resolvePreferredUiLocale } from "@/shared/i18n/resolve-locale";
import {
  SURVEY_STATUS,
  normalizeSurveyStatus,
} from "@/shared/surveys/constants";
import { ActivityFeed } from "@/shared/ui/workspace/activity-feed";
import { StatsCard } from "@/shared/ui/workspace/workspace-stat-card";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

type DashboardStats = {
  totalSurveys: number;
  totalClassrooms: number;
  totalTopics: number;
  totalStudents: number;
};

type RecentSurveyItem = {
  id: string;
  title: string;
  status: string;
  responses: number;
  maxResponses: number;
  updatedAt: string | Date;
  createdAt: string | Date;
  isVoice: boolean;
  folderId: string | null;
  folderName: string | null;
};

type DashboardActivityItem = {
  id: string;
  type: "new_response";
  description: string;
  createdAt: string | Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDateLike(value: unknown): value is string | Date {
  return typeof value === "string" || value instanceof Date;
}

function isDashboardStats(value: unknown): value is DashboardStats {
  return (
    isRecord(value) &&
    typeof value.totalSurveys === "number" &&
    typeof value.totalClassrooms === "number" &&
    typeof value.totalTopics === "number" &&
    typeof value.totalStudents === "number"
  );
}

function isRecentSurveyItem(value: unknown): value is RecentSurveyItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string" &&
    typeof value.responses === "number" &&
    typeof value.maxResponses === "number" &&
    isDateLike(value.updatedAt) &&
    isDateLike(value.createdAt) &&
    typeof value.isVoice === "boolean" &&
    (typeof value.folderId === "string" || value.folderId === null) &&
    (typeof value.folderName === "string" || value.folderName === null)
  );
}

function isRecentSurveyList(value: unknown): value is RecentSurveyItem[] {
  return Array.isArray(value) && value.every(isRecentSurveyItem);
}

function isDashboardActivityItem(value: unknown): value is DashboardActivityItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.type === "new_response" &&
    typeof value.description === "string" &&
    isDateLike(value.createdAt)
  );
}

function isDashboardActivityList(value: unknown): value is DashboardActivityItem[] {
  return Array.isArray(value) && value.every(isDashboardActivityItem);
}

export async function DashboardHomeContent({
  authHeaders,
  translations,
}: {
  authHeaders: Headers | string | null;
  translations: Translate;
}) {
  const session = await getVerifiedSession(authHeaders);
  const userId = session.user.id;
  const language = await resolvePreferredUiLocale(session);

  const quickActions = [
    {
      title: "Start Learning",
      description: "Create a new learning topic for your students",
      icon: Sparkles,
      href: "/dashboard/learning",
      color: "from-blue-600 to-indigo-600",
    },
    {
      title: translations("QuickActions.ViewAnalytics.Title"),
      description: translations("QuickActions.ViewAnalytics.Description"),
      icon: BarChart3,
      href: "/dashboard/analytics",
      color: "from-purple-500 to-pink-500",
    },
    {
      title: "Folders",
      description:
        "Organize surveys into teacher-friendly folders for better structure.",
      icon: FolderOpen,
      href: "/dashboard/folders",
      color: "from-amber-500 to-orange-500",
    },
    {
      title: "Classrooms",
      description:
        "Run classes, topics, student tutoring, and progress tracking.",
      icon: GraduationCap,
      href: "/dashboard/learning",
      color: "from-sky-500 to-blue-500",
    },
  ];

  const [stats, recentSurveys, activities] = await Promise.all([
    cache.wrap(
      cacheKeys.dashboardStats(userId),
      async (): Promise<DashboardStats> => {
        const [
          surveysCountResult,
          classroomsCountResult,
          topicsCountResult,
          studentsCountResult,
        ] = await Promise.all([
          getDb()
            .select({ count: count() })
            .from(surveys)
            .where(eq(surveys.userId, userId)),
          getDb()
            .select({ count: count() })
            .from(classrooms)
            .where(eq(classrooms.teacherUserId, userId)),
          getDb()
            .select({ count: count() })
            .from(learningTopics)
            .where(eq(learningTopics.createdByUserId, userId)),
          getDb()
            .select({ count: count() })
            .from(classroomStudents)
            .innerJoin(
              classrooms,
              eq(classroomStudents.classroomId, classrooms.id),
            )
            .where(eq(classrooms.teacherUserId, userId)),
        ]);

        return {
          totalSurveys: surveysCountResult[0]?.count || 0,
          totalClassrooms: classroomsCountResult[0]?.count || 0,
          totalTopics: topicsCountResult[0]?.count || 0,
          totalStudents: studentsCountResult[0]?.count || 0,
        };
      },
      60 * 5,
      isDashboardStats,
    ),
    cache.wrap(
      cacheKeys.dashboardRecentSurveys(userId),
      async (): Promise<RecentSurveyItem[]> => {
        const surveysData = await getDb().query.surveys.findMany({
          where: eq(surveys.userId, userId),
          orderBy: [desc(surveys.updatedAt)],
          limit: 3,
          with: {
            folder: {
              columns: { id: true, name: true },
            },
          },
        });

        return surveysData.map((survey) => ({
          id: survey.id,
          title: survey.title,
          status: survey.status,
          responses: survey.currentParticipants,
          maxResponses: survey.participantLimit ?? 0,
          updatedAt: survey.updatedAt,
          createdAt: survey.createdAt,
          isVoice: survey.isVoice,
          folderId: survey.folderId,
          folderName: survey.folder?.name ?? null,
        }));
      },
      60 * 2,
      isRecentSurveyList,
    ),
    cache.wrap(
      cacheKeys.dashboardActivity(userId),
      async (): Promise<DashboardActivityItem[]> => {
        const recentActivities = await getDb()
          .select({
            id: surveyConversations.id,
            surveyTitle: surveys.title,
            createdAt: surveyConversations.createdAt,
          })
          .from(surveyConversations)
          .innerJoin(surveys, eq(surveyConversations.surveyId, surveys.id))
          .where(eq(surveys.userId, userId))
          .orderBy(desc(surveyConversations.createdAt))
          .limit(5);

        return recentActivities.flatMap((activity) =>
          activity.createdAt
            ? [
                {
                  id: activity.id,
                  type: "new_response" as const,
                  description: activity.surveyTitle,
                  createdAt: activity.createdAt,
                },
              ]
            : [],
        );
      },
      60,
      isDashboardActivityList,
    ),
  ]);

  const formattedRecentSurveys = recentSurveys.map((survey) => ({
    ...survey,
    status: normalizeSurveyStatus(survey.status, SURVEY_STATUS.DRAFT),
    lastActivity: new Intl.DateTimeFormat(language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(survey.updatedAt)),
    createdAtFormatted: new Intl.DateTimeFormat(language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(survey.createdAt)),
    folderName: survey.folderName ?? (survey.folderId ? "Folder" : "Unsorted"),
  }));

  const formattedActivities = activities.map((activity) => ({
    ...activity,
    title: translations("Activity.NewResponse"),
    time: new Intl.DateTimeFormat(language, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(activity.createdAt)),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111] lg:text-3xl">
            Teaching Workspace
          </h1>
          <p className="mt-1 text-sm text-[#666666] lg:mt-2 lg:text-base">
            Manage your AI-powered classrooms and track student learning
            progress.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
        <StatsCard
          title="Active Classrooms"
          value={stats.totalClassrooms.toString()}
          change="Manage Classes"
          changeType="neutral"
          icon={<GraduationCap className="h-6 w-6" />}
          iconColor="bg-sky-50 text-sky-600"
        />
        <StatsCard
          title="Learning Topics"
          value={stats.totalTopics.toString()}
          change="Active Lessons"
          changeType="neutral"
          icon={<BookOpen className="h-6 w-6" />}
          iconColor="bg-indigo-50 text-indigo-600"
        />
        <StatsCard
          title="Total Students"
          value={stats.totalStudents.toString()}
          change="Enrolled"
          changeType="neutral"
          icon={<Users className="h-6 w-6" />}
          iconColor="bg-emerald-50 text-emerald-600"
        />
        <StatsCard
          title="Total Surveys"
          value={stats.totalSurveys.toString()}
          change="Form Builder"
          changeType="neutral"
          icon={<MessageSquare className="h-6 w-6" />}
          iconColor="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {quickActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group rounded-2xl border border-gray-100 bg-white p-5 transition-all duration-300 hover:border-gray-200 hover:shadow-lg"
          >
            <div
              className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${action.color} transition-transform duration-300 group-hover:scale-110`}
            >
              <action.icon className="h-5 w-5 text-white" />
            </div>
            <h3 className="mb-1 font-semibold text-gray-900">{action.title}</h3>
            <p className="text-sm text-gray-500">{action.description}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {translations("RecentSurveys.Title")}
            </h2>
            <Link
              href="/dashboard/surveys"
              className="flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              {translations("RecentSurveys.ViewAll")}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {formattedRecentSurveys.map((survey) => (
              <SurveyCard
                key={survey.id}
                {...survey}
                createdAt={survey.createdAtFormatted}
              />
            ))}
          </div>

          {formattedRecentSurveys.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                {translations("RecentSurveys.NoSurveys")}
              </h3>
              <p className="mx-auto mb-6 max-w-sm text-gray-500">
                {translations("RecentSurveys.GetStarted")}
              </p>
              <Link
                href="/dashboard/create"
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 font-medium text-white transition-colors hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                {translations("RecentSurveys.CreateFirst")}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="space-y-6 lg:col-span-1">
          <ActivityFeed activities={formattedActivities} />
        </div>
      </div>
    </div>
  );
}
