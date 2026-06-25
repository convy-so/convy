"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LayoutDashboard, Loader2, MessageSquare, RefreshCw } from "lucide-react";

import type { AnalyticsPendingData, SurveyAnalyticsData } from "@/features/surveys/server/analytics/dashboard-analytics";
import { refreshSurveyAnalyticsAction } from "@/app/actions/survey";
import { Link } from "@/i18n/routing";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { NarrativeReport } from "./narrative-report";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { readJsonResponseValue } from "@/shared/http/json";
import toast from "react-hot-toast";

interface AnalyticsDashboardProps {
  surveyId: string;
  initialData?: SurveyAnalyticsData | AnalyticsPendingData;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load analytics";
}

function isAnalyticsPendingData(
  value: unknown,
): value is AnalyticsPendingData {
  return (
    isRecord(value) &&
    (value.status === "not_generated" ||
      value.status === "queued" ||
      value.status === "running" ||
      value.status === "failed")
  );
}

function isSurveyAnalyticsData(
  value: unknown,
): value is SurveyAnalyticsData {
  return isRecord(value) && value.status === "ready";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResponseErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  return typeof payload.error === "string" ? payload.error : null;
}

function parseAnalyticsResponse(
  payload: unknown,
): SurveyAnalyticsData | AnalyticsPendingData | null {
  if (!isRecord(payload) || typeof payload.status !== "string") {
    return null;
  }

  if (isSurveyAnalyticsData(payload) || isAnalyticsPendingData(payload)) {
    return payload;
  }

  return null;
}

async function fetchAnalytics(
  surveyId: string,
): Promise<SurveyAnalyticsData | AnalyticsPendingData> {
  const res = await fetch(`/api/surveys/${surveyId}/analytics`);
  const data = await readJsonResponseValue(res);
  if (!res.ok) {
    throw new Error(getResponseErrorMessage(data) ?? "Failed to fetch analytics");
  }

  const parsed = parseAnalyticsResponse(data);
  if (!parsed) {
    throw new Error("Failed to fetch analytics");
  }

  return parsed;
}

export function AnalyticsDashboard({
  surveyId,
  initialData,
}: AnalyticsDashboardProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["survey-analytics", surveyId],
    queryFn: () => fetchAnalytics(surveyId),
    initialData,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "running"
        ? 5000
        : query.state.data?.status === "not_generated"
          ? 10000
          : 300000,
  });

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const result = await refreshSurveyAnalyticsAction({ surveyId });

      if (!result.success) {
        toast.error(getFriendlyActionError(result.error, "Failed to queue analytics refresh"));
        return;
      }

      toast.success("Analytics refresh queued");
      await refetch();
    } catch (error) {
      console.error("[handleRegenerate] Failed:", error);
      toast.error("Failed to queue analytics refresh");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-gray-500">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-black" />
        <p className="text-sm font-medium">Loading research intelligence...</p>
      </div>
    );
  }

  if (!data && error) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-red-500">
        <AlertCircle className="mb-4 h-10 w-10" />
        <p className="text-lg font-bold">Analytics unavailable</p>
        <p className="mt-1 text-sm text-gray-500">{getErrorMessage(error)}</p>
        <button
          onClick={() => {
            void refetch();
          }}
          className="mt-6 rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-900 shadow-sm transition-all hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-gray-500">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-black" />
        <p className="text-sm font-medium">Loading research intelligence...</p>
      </div>
    );
  }

  if (error) {
    console.error("[AnalyticsDashboard] Background refresh failed:", error);
  }

  if (!isSurveyAnalyticsData(data)) {
    const pending = isAnalyticsPendingData(data) ? data : undefined;
    return (
      <div className="mx-auto mt-8 flex min-h-[400px] max-w-2xl flex-col items-center justify-center rounded-[2.5rem] border border-dashed border-gray-200 bg-white p-12 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-50">
          <RefreshCw
            className={cn(
              "h-8 w-8 text-black",
              pending?.status === "queued" || pending?.status === "running"
                ? "animate-spin"
                : "",
            )}
          />
        </div>
        <h3 className="mb-3 text-2xl font-bold tracking-tight text-gray-900">
          {pending?.status === "failed"
            ? "Analytics Refresh Failed"
            : pending?.status === "queued"
              ? "Analytics Refresh Queued"
              : pending?.status === "running"
                ? "Rebuilding Analytics"
                : "Building Analytics Snapshot"}
        </h3>
        <p className="mb-8 max-w-md text-gray-500">
          {pending?.message ||
            "We are waiting for enough grounded session evidence to build analytics."}
        </p>
        {pending?.analyticsState?.lastMaterialityReason && (
          <div className="mb-6 rounded-full bg-gray-50 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Trigger: {pending.analyticsState.lastMaterialityReason.replaceAll("_", " ")}
          </div>
        )}
        <div className="flex gap-8 rounded-[2rem] bg-gray-50 px-8 py-5 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black text-gray-900">
              {pending?.conversationStats.total || 0}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Sessions
            </span>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black text-gray-900">
              {pending?.conversationStats.completed || 0}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Completed
            </span>
          </div>
        </div>
        <button
          onClick={() => {
            void handleRegenerate();
          }}
          disabled={isRegenerating}
          className="mt-8 rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-900 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-50"
        >
          {isRegenerating ? "Queueing refresh..." : "Queue refresh"}
        </button>
      </div>
    );
  }

  const analytics = data;

  return (
    <div className="animate-in fade-in space-y-12 duration-700 pb-20">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gray-100 p-2.5">
            <LayoutDashboard className="h-5 w-5 text-gray-900" />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase leading-none tracking-widest text-gray-400">
              Refreshed {new Date(analytics.generatedAt).toLocaleDateString()} • v{analytics.snapshotVersion}
            </div>
            <h2 className="text-lg font-bold leading-none tracking-tight text-gray-900">
              Evidence-backed Analytics
            </h2>
            <div className="mt-2 text-[11px] font-medium text-gray-500">
              Status: {analytics.analyticsState.status}
              {analytics.analyticsState.lastMaterialityReason
                ? ` • ${analytics.analyticsState.lastMaterialityReason.replaceAll("_", " ")}`
                : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/surveys/${surveyId}/analytics/chat`}
            className="flex items-center gap-2.5 rounded-full bg-gray-900 px-6 py-2.5 text-sm font-bold text-white shadow-xl shadow-gray-200 transition-all hover:bg-black"
          >
            <MessageSquare className="h-4 w-4" />
            Chat with Data
          </Link>
          <button
            onClick={() => {
              void handleRegenerate();
            }}
            disabled={isRegenerating}
            className="rounded-full p-2.5 transition-colors hover:bg-gray-100 disabled:opacity-50"
            title="Regenerate analytics"
          >
            <RefreshCw
              className={cn("h-5 w-5 text-gray-400", isRegenerating && "animate-spin")}
            />
          </button>
        </div>
      </div>

      <NarrativeReport data={analytics} surveyId={surveyId} />
    </div>
  );
}
