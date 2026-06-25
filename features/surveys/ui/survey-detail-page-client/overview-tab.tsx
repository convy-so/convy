"use client";

import { Calendar, Clock, Copy, Share2, TrendingUp, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SurveyDetailsResponse } from "@/features/surveys/client/api/surveys-api";
import { cn } from "@/shared/ui/tailwind-class-utils";

type ResponseRecord = {
  id: string;
  participantId: string;
  status: "completed" | "abandoned";
  completedAt: string | null;
  createdAt: string | null;
  duration: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  keyInsights: string[];
};

type Translate = ReturnType<typeof useTranslations>;

export function SurveyOverviewTab({
  survey,
  stats,
  responses,
  copyLink,
  setResponsesTab,
  t,
}: {
  survey: NonNullable<SurveyDetailsResponse["survey"]>;
  stats: SurveyDetailsResponse["stats"] | null;
  responses: ResponseRecord[];
  copyLink: () => void;
  setResponsesTab: () => void;
  t: Translate;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-2">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-500">
            <Users className="h-4 w-4" />
            <span className="text-sm">{t("Overview.Responses.Title")}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.totalResponses || 0}</p>
          <p className="mt-1 text-xs text-gray-400">
            {t("Overview.Responses.Target", { limit: survey.participantLimit })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-500">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">Completion Rate</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.completionRate || 0}%</p>
          <p className="mt-1 text-xs text-gray-400">{`${stats?.completedResponses || 0} completions`}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-500">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{t("Overview.Duration.Title")}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.avgDuration || "0s"}</p>
          <p className="mt-1 text-xs text-gray-400">{t("Overview.Duration.Unit")}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-500">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">{t("Overview.Created.Title")}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {survey.createdAt
              ? new Date(survey.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "N/A"}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {survey.createdAt
              ? new Date(survey.createdAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
          <Share2 className="h-4 w-4" />
          {t("Overview.ShareLink")}
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={survey.shareableUrl || "Not published yet"}
            readOnly
            className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
          />
          <button
            onClick={copyLink}
            className="rounded-lg bg-gray-900 p-2 text-white transition-colors hover:bg-gray-800"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 lg:col-span-2">
        <h3 className="mb-4 font-semibold text-gray-900">
          {t("Overview.Configuration.Title")}
        </h3>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm text-gray-500">
              {t("Overview.Configuration.Objective")}
            </p>
            <p className="text-gray-900">
              {survey.coreObjective ||
                survey.brief?.researchGoal ||
                t("Overview.Configuration.NotSpecified")}
            </p>
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-500">
              {t("Overview.Configuration.TargetAudience")}
            </p>
            <p className="text-gray-900">
              {survey.brief?.audienceDefinition ||
                t("Overview.Configuration.NotSpecified")}
            </p>
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-500">
              {t("Overview.Configuration.Tone")}
            </p>
            <p className="capitalize text-gray-900">
              {survey.tone || survey.brief?.tone || "casual"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            {t("Overview.RecentResponses.Title")}
          </h3>
          <button
            onClick={setResponsesTab}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            {t("Overview.RecentResponses.ViewAll")}
          </button>
        </div>
        <div className="space-y-3">
          {responses.length > 0 ? (
            responses.slice(0, 3).map((response) => (
              <div
                key={response.id}
                className="flex flex-col justify-between gap-3 rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100/80 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3 sm:items-center">
                  <div
                    className={cn(
                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0",
                      response.status === "completed"
                        ? "bg-emerald-500 shadow-sm shadow-emerald-200"
                        : "bg-amber-400 shadow-sm shadow-amber-200",
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">
                      {response.participantId === "Anonymous"
                        ? t("Responses.Table.Anonymous")
                        : t("Responses.Table.Participant", {
                            id: response.id.slice(0, 4),
                          })}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>
                        {response.status === "completed"
                          ? t("Responses.Table.Status.Completed")
                          : t("Responses.Table.Status.InProgress")}
                      </span>
                      <span>&bull;</span>
                      <span>
                        {response.completedAt
                          ? new Date(response.completedAt).toLocaleDateString()
                          : response.createdAt
                            ? new Date(response.createdAt).toLocaleDateString()
                            : "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="ml-5 flex items-center gap-2 sm:ml-0">
                  {response.sentiment ? (
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                        response.sentiment === "positive" &&
                          "bg-emerald-100 text-emerald-700",
                        response.sentiment === "neutral" &&
                          "bg-gray-200 text-gray-700",
                        response.sentiment === "negative" &&
                          "bg-red-100 text-red-700",
                      )}
                    >
                      {response.sentiment}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm">
                    <Clock className="h-3 w-3" />
                    {response.duration}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-gray-500">
              {t("Overview.RecentResponses.NoResponses")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
