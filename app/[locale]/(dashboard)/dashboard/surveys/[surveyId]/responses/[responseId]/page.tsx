"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Loader2,
  Quote,
  ShieldCheck,
  TriangleAlert,
  User,
} from "lucide-react";

import type { AnalyticsSessionDetail } from "@/lib/analytics";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export default function ResponseDetailPage() {
  const params = useParams<{
    surveyId?: string | string[];
    responseId?: string | string[];
  }>();
  const surveyId = Array.isArray(params.surveyId)
    ? (params.surveyId[0] ?? "")
    : (params.surveyId ?? "");
  const responseId = Array.isArray(params.responseId)
    ? (params.responseId[0] ?? "")
    : (params.responseId ?? "");

  const [response, setResponse] = useState<AnalyticsSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResponse() {
      try {
        const res = await fetch(`/api/surveys/${surveyId}/responses/${responseId}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Session not found");
          throw new Error("Failed to load session data");
        }
        const data = await res.json();
        setResponse(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    if (surveyId && responseId) fetchResponse();
  }, [surveyId, responseId]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !response) {
    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
          <p className="text-gray-500">
          {error || "Session not found"}
          </p>
        <Link
          href={`/dashboard/surveys/${surveyId}/analytics/conversations`}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-white transition-colors hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href={`/dashboard/surveys/${surveyId}/analytics/conversations`}
              className="self-start rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">
                  Session {response.id.slice(-4)}
                </h1>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
                    response.status === "completed"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700",
                  )}
                >
                  {response.status}
                </span>
                <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {response.sessionType} session
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Analytics drilldown for{" "}
                <span className="font-medium text-gray-700">{response.surveyTitle}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                Transcript
              </h2>
              <span className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-500 shadow-sm">
                {response.transcript.length} turns
              </span>
            </div>
            <div className="max-h-[800px] overflow-y-auto">
              {response.transcript.length === 0 ? (
                <div className="p-8 text-center italic text-gray-400">
                  No transcript available.
                </div>
              ) : (
                response.transcript.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "border-b border-gray-50 px-6 py-5 last:border-0",
                      message.role === "assistant" ? "bg-white" : "bg-gray-50/50",
                    )}
                  >
                    <div className="mx-auto flex max-w-3xl gap-4">
                      <div
                        className={cn(
                          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg shadow-sm",
                          message.role === "assistant"
                            ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                            : "bg-gray-900",
                        )}
                      >
                        {message.role === "assistant" ? (
                          <Bot className="h-4 w-4 text-white" />
                        ) : (
                          <User className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 text-sm font-semibold text-gray-900">
                          {message.role === "assistant" ? "Convyy AI" : "Participant"}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <StatPanel
            title="Session Quality"
            rows={[
              {
                icon: ShieldCheck,
                label: "Reliability",
                value: `${response.reliabilityPercent}%`,
              },
              {
                icon: ShieldCheck,
                label: "Completeness",
                value: `${response.completenessPercent}%`,
              },
              {
                icon: TriangleAlert,
                label: "Fatigue",
                value: `${response.fatiguePercent}%`,
              },
            ]}
          />

          <TextPanel title="Summary" body={response.summary} />

          <ListPanel
            title="Key Findings"
            icon={Quote}
            items={response.keyFindings}
            emptyMessage="No key findings extracted yet."
          />

          <ListPanel
            title="Risks"
            icon={TriangleAlert}
            items={response.risks}
            emptyMessage="No major risks flagged."
          />

          <CoveragePanel coverage={response.nodeCoverage} />

          <QuotePanel quotes={response.notableQuotes} />
        </div>
      </div>
    </div>
  );
}

function StatPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ icon: React.ElementType; label: string; value: string }>;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-900">{title}</h3>
      <div className="space-y-4">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <Icon className="h-3.5 w-3.5" />
                {row.label}
              </span>
              <span className="rounded bg-gray-50 px-2 py-1 text-sm font-medium text-gray-900">
                {row.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-semibold text-gray-900">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-700">{body}</p>
    </div>
  );
}

function ListPanel({
  title,
  items,
  emptyMessage,
  icon: Icon,
}: {
  title: string;
  items: string[];
  emptyMessage: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="flex gap-3 text-sm text-gray-600">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      )}
    </div>
  );
}

function CoveragePanel({
  coverage,
}: {
  coverage: AnalyticsSessionDetail["nodeCoverage"];
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-900">Node Coverage</h3>
      <div className="space-y-4">
        {coverage.map((item) => (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-800">{item.label}</span>
              <span className="text-xs font-bold text-gray-500">
                {item.coveragePercent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-900"
                style={{ width: `${item.coveragePercent}%` }}
              />
            </div>
            <p className="text-xs leading-relaxed text-gray-500">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuotePanel({
  quotes,
}: {
  quotes: AnalyticsSessionDetail["notableQuotes"];
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-900">Notable Quotes</h3>
      {quotes.length > 0 ? (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <blockquote
              key={quote.id}
              className="rounded-xl bg-gray-50 p-4 text-sm italic leading-relaxed text-gray-700"
            >
              &quot;{quote.excerpt}&quot;
              <div className="mt-2 text-[11px] font-medium not-italic text-gray-400">
                {quote.nodeId} • reliability {quote.reliability}%
              </div>
            </blockquote>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No notable quotes selected yet.</p>
      )}
    </div>
  );
}
