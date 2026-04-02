import { Suspense } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";

import { ConversationCard } from "@/components/analytics/ConversationCard";
import { buildConversationListItem } from "@/lib/analytics";
import { Link, redirect } from "@/i18n/routing";
import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { surveySessionInsights, surveySessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { conversationInsightSchema } from "@/lib/education/types";
import { getSurveyPermissionContext } from "@/lib/workspace-access";
import { getTranslations } from "next-intl/server";

interface PageProps {
  params: Promise<{ surveyId: string; locale: string }>;
}

export default async function ConversationsPage({ params }: PageProps) {
  const { surveyId, locale } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <ConversationsContent surveyId={surveyId} locale={locale} />
    </Suspense>
  );
}

async function ConversationsContent({
  surveyId,
  locale,
}: {
  surveyId: string;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "SurveyAnalytics.Conversations" });
  const tt = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);
  const session = await getVerifiedSession();
  const permission = await getSurveyPermissionContext(session.user.id, surveyId);
  if (!permission?.canView) {
    redirect({ href: "/dashboard/analytics", locale });
  }

  const rows = await getDb()
    .select({
      sessionId: surveySessionInsights.sessionId,
      insight: surveySessionInsights.insight,
      createdAt: surveySessions.createdAt,
      sessionType: surveySessions.sessionType,
      sourceConversationId: surveySessions.sourceConversationId,
    })
    .from(surveySessionInsights)
    .innerJoin(surveySessions, eq(surveySessions.id, surveySessionInsights.sessionId))
    .where(
      and(
        eq(surveySessionInsights.surveyId, surveyId),
        eq(surveySessions.sessionType, "live"),
      ),
    );

  const conversations = rows.flatMap((row) => {
    const parsedInsight = conversationInsightSchema.safeParse(row.insight);

    if (!parsedInsight.success) {
      return [];
    }

    return [
      buildConversationListItem({
        insight: parsedInsight.data,
        sessionType: row.sessionType,
        createdAt: row.createdAt,
        sourceConversationId: row.sourceConversationId,
      }),
    ];
  });
  const total = conversations.length;
  const highQuality = conversations.filter(
    (item) => item.completenessPercent >= 80 && item.reliabilityPercent >= 65,
  ).length;
  const averageReliability =
    total > 0
      ? Math.round(
          conversations.reduce((sum, item) => sum + item.reliabilityPercent, 0) /
            total,
        )
      : 0;

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/surveys/${surveyId}/analytics`}
            className="group rounded-full p-2 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-400 transition-colors group-hover:text-gray-700" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {tt("Title", "Session Insights")}
            </h1>
            <p className="text-sm text-gray-500">
              {tt("Description", "Review the session-level summaries that feed the analytics snapshot.")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            label={tt("Stats.Sessions", "Sessions")}
            value={String(total)}
          />
          <StatCard
            label={tt("Stats.HighQuality", "High quality")}
            value={String(highQuality)}
          />
          <StatCard
            label={tt("Stats.AverageReliability", "Average reliability")}
            value={`${averageReliability}%`}
          />
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={tt("SearchPlaceholder", "Search session summaries...")}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 outline-none transition-all focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            disabled
          />
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-20">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Search className="h-6 w-6 text-gray-400" />
          </div>
          <h3 className="mb-1 font-medium text-gray-900">
            {tt("EmptyTitle", "No session insights yet")}
          </h3>
          <p className="text-sm text-gray-500">
            {tt("EmptyDescription", "Complete a few live sessions to populate grounded analytics.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {conversations.map((conversation) => (
            <ConversationCard
              key={conversation.sessionId}
              surveyId={surveyId}
              conversation={conversation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-gray-900">
        {value}
      </div>
    </div>
  );
}
