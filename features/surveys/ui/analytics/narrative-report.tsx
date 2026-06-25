"use client";

import { useMemo, useState, type HTMLAttributes } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsCompareData, SurveyAnalyticsData } from "@/features/surveys/server/analytics/dashboard-analytics";
import { Link } from "@/i18n/routing";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart";
import { readJsonResponseValue } from "@/shared/http/json";
import { cn } from "@/shared/ui/tailwind-class-utils";

interface NarrativeReportProps {
  data: SurveyAnalyticsData;
  surveyId: string;
}

const coverageChartConfig = {
  coveragePercent: {
    color: "var(--color-chart-1)",
    label: "Coverage",
  },
} satisfies ChartConfig;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimelineEntry(value: unknown): value is AnalyticsCompareData["left"] {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    typeof value.generatedAt === "string" &&
    typeof value.triggerReason === "string" &&
    (value.triggeredBy === "automatic" || value.triggeredBy === "manual") &&
    typeof value.completedSessions === "number" &&
    typeof value.totalSessions === "number" &&
    typeof value.coveragePercent === "number" &&
    typeof value.reliabilityPercent === "number" &&
    typeof value.flaggedSessions === "number" &&
    typeof value.findingsCount === "number" &&
    typeof value.dataGapsCount === "number"
  );
}

function parseStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function parseCoverageChanges(
  value: unknown,
): AnalyticsCompareData["coverageChanges"] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const changes = value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.nodeId !== "string" ||
      typeof item.label !== "string" ||
      typeof item.fromPercent !== "number" ||
      typeof item.toPercent !== "number" ||
      typeof item.deltaPercent !== "number"
    ) {
      return [];
    }

    return [
      {
        nodeId: item.nodeId,
        label: item.label,
        fromPercent: item.fromPercent,
        toPercent: item.toPercent,
        deltaPercent: item.deltaPercent,
      },
    ];
  });

  return changes.length === value.length ? changes : null;
}

function parseAnalyticsCompareData(value: unknown): AnalyticsCompareData | null {
  if (!isRecord(value) || !isTimelineEntry(value.left) || !isTimelineEntry(value.right)) {
    return null;
  }

  if (
    !isRecord(value.metricDelta) ||
    typeof value.metricDelta.completedSessions !== "number" ||
    typeof value.metricDelta.totalSessions !== "number" ||
    typeof value.metricDelta.coveragePercent !== "number" ||
    typeof value.metricDelta.reliabilityPercent !== "number" ||
    typeof value.metricDelta.flaggedSessions !== "number" ||
    typeof value.metricDelta.findingsCount !== "number" ||
    typeof value.metricDelta.dataGapsCount !== "number"
  ) {
    return null;
  }

  const coverageChanges = parseCoverageChanges(value.coverageChanges);
  const findingsAdded = parseStringArray(value.findingsAdded);
  const findingsRemoved = parseStringArray(value.findingsRemoved);
  const recommendationsAdded = parseStringArray(value.recommendationsAdded);
  const recommendationsRemoved = parseStringArray(value.recommendationsRemoved);
  const dataGapsClosed = parseStringArray(value.dataGapsClosed);
  const dataGapsOpened = parseStringArray(value.dataGapsOpened);

  if (
    !coverageChanges ||
    !findingsAdded ||
    !findingsRemoved ||
    !recommendationsAdded ||
    !recommendationsRemoved ||
    !dataGapsClosed ||
    !dataGapsOpened
  ) {
    return null;
  }

  return {
    left: value.left,
    right: value.right,
    metricDelta: {
      completedSessions: value.metricDelta.completedSessions,
      totalSessions: value.metricDelta.totalSessions,
      coveragePercent: value.metricDelta.coveragePercent,
      reliabilityPercent: value.metricDelta.reliabilityPercent,
      flaggedSessions: value.metricDelta.flaggedSessions,
      findingsCount: value.metricDelta.findingsCount,
      dataGapsCount: value.metricDelta.dataGapsCount,
    },
    coverageChanges,
    findingsAdded,
    findingsRemoved,
    recommendationsAdded,
    recommendationsRemoved,
    dataGapsClosed,
    dataGapsOpened,
  };
}

function SurveyAnalyticsCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <Card className={cn("rounded-[2rem] border-gray-100", className)} {...props} />;
}

export function NarrativeReport({ data, surveyId }: NarrativeReportProps) {
  const [selectedVersions, setSelectedVersions] = useState<number[]>([
    data.timeline[1]?.version ?? data.snapshotVersion,
    data.snapshotVersion,
  ]);
  const timeline = useMemo(
    () =>
      [...data.timeline].sort(
        (left, right) => left.version - right.version,
      ),
    [data.timeline],
  );

  const compareEnabled =
    Boolean(selectedVersions[0] && selectedVersions[1]) &&
    selectedVersions[0] !== selectedVersions[1];
  const { data: compareData } = useQuery<AnalyticsCompareData>({
    queryKey: ["analytics-compare", surveyId, selectedVersions[0], selectedVersions[1]],
    queryFn: async () => {
      const res = await fetch(
        `/api/surveys/${surveyId}/analytics/compare?leftVersion=${selectedVersions[0]}&rightVersion=${selectedVersions[1]}`,
      );
      if (!res.ok) {
        throw new Error("Failed to compare analytics snapshots");
      }
      const data = await readJsonResponseValue(res);
      const parsed = parseAnalyticsCompareData(data);
      if (!parsed) {
        throw new Error("Failed to compare analytics snapshots");
      }
      return parsed;
    },
    enabled: Boolean(compareEnabled),
  });

  const toggleCompareVersion = (version: number) => {
    setSelectedVersions((current) => {
      if (current.includes(version)) {
        return current.filter((item) => item !== version);
      }
      const nextOldestVersion = current[1];
      if (current.length >= 2 && nextOldestVersion !== undefined) {
        return [nextOldestVersion, version];
      }
      return [...current, version];
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-16 pb-20">
      <section className="sticky top-0 z-10 -mx-2 overflow-x-auto px-2 pb-2 pt-1">
        <div className="inline-flex gap-2 rounded-full border border-gray-100 bg-white/90 px-2 py-2 shadow-sm backdrop-blur">
          {["Overview", "Timeline", "Compare", "Sessions", "Chat"].map((item) => (
            <a
              key={item}
              href={item === "Chat" ? `/dashboard/surveys/${surveyId}/analytics/chat` : `#${item.toLowerCase()}`}
              className="rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              {item}
            </a>
          ))}
        </div>
      </section>

      <section id="overview" className="space-y-6">
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {data.program.displayName}
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-gray-900">
            {data.findings[0]?.title || "Analytics snapshot ready"}
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-gray-500">
            {data.program.description}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SurveyAnalyticsSummaryCard
            label="Sessions"
            value={String(data.participation.totalSessions)}
            helper={`${data.participation.completedSessions} completed`}
          />
          <SurveyAnalyticsSummaryCard
            label="Coverage"
            value={`${data.coverage.overallPercent}%`}
            helper="Across required study nodes"
          />
          <SurveyAnalyticsSummaryCard
            label="Reliability"
            value={`${data.quality.averageReliabilityPercent}%`}
            helper={`${data.quality.flaggedSessions} flagged sessions`}
          />
        </div>
      </section>

      <section id="timeline" className="space-y-6 border-t border-gray-100 pt-8">
        <SurveyAnalyticsSectionHeading
          title="Snapshot Timeline"
          description="A material-change history of how the analytics evolved as grounded live responses accumulated."
        />
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {timeline.map((item) => {
              const selected = selectedVersions.includes(item.version);
              return (
                <button
                  key={item.version}
                  onClick={() => toggleCompareVersion(item.version)}
                  className={cn(
                    "w-72 flex-shrink-0 rounded-[2rem] border p-5 text-left shadow-sm transition-all",
                    selected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-100 bg-white hover:border-gray-300",
                  )}
                >
                  <div className={cn("text-[10px] font-bold uppercase tracking-widest", selected ? "text-gray-300" : "text-gray-400")}>
                    Version {item.version}
                  </div>
                  <div className="mt-2 text-lg font-bold tracking-tight">
                    {new Date(item.generatedAt).toLocaleDateString()}
                  </div>
                  <div className={cn("mt-1 text-sm", selected ? "text-gray-200" : "text-gray-500")}>
                    {item.triggerReason.replaceAll("_", " ")}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <SnapshotTimelineStat label="Completed" value={String(item.completedSessions)} selected={selected} />
                    <SnapshotTimelineStat label="Coverage" value={`${item.coveragePercent}%`} selected={selected} />
                    <SnapshotTimelineStat label="Reliability" value={`${item.reliabilityPercent}%`} selected={selected} />
                    <SnapshotTimelineStat label="Findings" value={String(item.findingsCount)} selected={selected} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Select two versions to compare them. The dashboard defaults to the latest snapshot while this rail helps you inspect how the evidence base matured.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-8 border-t border-gray-100 pt-8 md:grid-cols-2">
        <SurveyAnalyticsBriefCard
          title="Research Goal"
          body={data.brief.researchGoal}
          details={[
            `Decision: ${data.brief.decisionToInform}`,
            `Audience: ${data.brief.audienceDefinition}`,
          ]}
        />
        <SurveyAnalyticsBriefCard
          title="What This Snapshot Covers"
          body={
            data.brief.requiredTopics.length > 0
              ? data.brief.requiredTopics.join(", ")
              : "The study does not list explicit required topics yet."
          }
          details={data.brief.successCriteria.map((criterion) => `Success: ${criterion}`)}
        />
      </section>

      {data.derivedMetrics.length > 0 && (
        <section className="space-y-6 border-t border-gray-100 pt-8">
          <SurveyAnalyticsSectionHeading
            title="Derived Metrics"
            description="Supplementary metrics computed from the stored facts layer."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.derivedMetrics.map((metric) => (
              <SurveyAnalyticsSummaryCard
                key={metric.id}
                label={metric.label}
                value={String(metric.value)}
                helper={metric.description || "Computed from stored analytics facts"}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-6 border-t border-gray-100 pt-8">
        <SurveyAnalyticsSectionHeading
          title="Findings"
          description="Grounded patterns synthesized from the stored evidence and per-session insights."
        />
        <div className="space-y-5">
          {data.findings.length > 0 ? (
            data.findings.map((finding) => (
              <SurveyAnalyticsCard key={finding.id} className="p-6">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h3 className="text-xl font-bold tracking-tight text-gray-900">
                    {finding.title}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                      finding.confidence >= 0.75
                        ? "bg-black text-white"
                        : finding.confidence >= 0.55
                          ? "bg-gray-100 text-gray-700"
                          : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {finding.confidence >= 0.75
                      ? "Clear signal"
                      : finding.confidence >= 0.55
                        ? "Directional"
                        : "Low confidence"}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  {finding.summary}
                </p>
                {finding.nodeLabels.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {finding.nodeLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-600"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {finding.supportingEvidence.length > 0 && (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {finding.supportingEvidence.slice(0, 4).map((item) => (
                      <blockquote
                        key={item.id}
                        className="rounded-2xl bg-gray-50 p-4 text-sm italic leading-relaxed text-gray-700"
                      >
                        &quot;{item.excerpt}&quot;
                      </blockquote>
                    ))}
                  </div>
                )}
              </SurveyAnalyticsCard>
            ))
          ) : (
            <SurveyAnalyticsEmptyState message="No evidence-backed findings are available yet." />
          )}
        </div>
      </section>

      <section id="compare" className="space-y-6 border-t border-gray-100 pt-8">
        <SurveyAnalyticsSectionHeading
          title="Compare Snapshots"
          description="Track what changed between two analytics versions without diffing the whole dashboard manually."
        />
        {compareData ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <SurveyAnalyticsCard className="space-y-4 p-6">
              <h3 className="text-lg font-bold tracking-tight text-gray-900">
                Version {compareData.left.version} → Version {compareData.right.version}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <SnapshotDeltaCard label="Completed sessions" delta={compareData.metricDelta.completedSessions} />
                <SnapshotDeltaCard label="Coverage" delta={compareData.metricDelta.coveragePercent} suffix="pts" />
                <SnapshotDeltaCard label="Reliability" delta={compareData.metricDelta.reliabilityPercent} suffix="pts" />
                <SnapshotDeltaCard label="Findings" delta={compareData.metricDelta.findingsCount} />
              </div>
            </SurveyAnalyticsCard>
            <SurveyAnalyticsCard className="p-6">
              <h3 className="mb-4 text-lg font-bold tracking-tight text-gray-900">
                Coverage Deltas
              </h3>
              <div className="space-y-3">
                {compareData.coverageChanges.map((item) => (
                  <div key={item.nodeId} className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                      <div className="text-xs text-gray-500">
                        {item.fromPercent}% → {item.toPercent}%
                      </div>
                    </div>
                    <div className={cn("text-sm font-bold", item.deltaPercent >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {item.deltaPercent >= 0 ? "+" : ""}{item.deltaPercent} pts
                    </div>
                  </div>
                ))}
              </div>
            </SurveyAnalyticsCard>
            <SurveyAnalyticsCard className="p-6">
              <h3 className="mb-4 text-lg font-bold tracking-tight text-gray-900">Findings Changed</h3>
              <SnapshotChangeList
                added={compareData.findingsAdded}
                removed={compareData.findingsRemoved}
                addedLabel="Added"
                removedLabel="Removed"
              />
            </SurveyAnalyticsCard>
            <SurveyAnalyticsCard className="p-6">
              <h3 className="mb-4 text-lg font-bold tracking-tight text-gray-900">Actions and Gaps</h3>
              <SnapshotChangeList
                added={[...compareData.recommendationsAdded, ...compareData.dataGapsOpened.map((item) => `Gap opened: ${item}`)]}
                removed={[...compareData.recommendationsRemoved, ...compareData.dataGapsClosed.map((item) => `Gap closed: ${item}`)]}
                addedLabel="Opened / added"
                removedLabel="Closed / removed"
              />
            </SurveyAnalyticsCard>
          </div>
        ) : (
          <SurveyAnalyticsEmptyState message="Select two timeline versions to compare them." />
        )}
      </section>

      <section className="space-y-6 border-t border-gray-100 pt-8">
        <SurveyAnalyticsSectionHeading
          title="Coverage By Node"
          description="How thoroughly the current sessions covered the required study dimensions."
        />
        <SurveyAnalyticsCard className="p-6">
          <ChartContainer config={coverageChartConfig} className="h-[320px] w-full">
            <BarChart
              accessibilityLayer
              data={data.coverage.nodes}
              layout="vertical"
              margin={{ left: 40 }}
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="label"
                type="category"
                width={160}
                axisLine={false}
                tickLine={false}
                fontSize={11}
                tick={{ fill: "#6B7280" }}
              />
              <ChartTooltip
                cursor={{ fill: "transparent" }}
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="label"
                    formatter={(value) => (
                      <>
                        <span className="text-muted-foreground">Coverage</span>
                        <span className="font-medium text-foreground">
                          {value || 0}%
                        </span>
                      </>
                    )}
                  />
                }
              />
              <Bar
                dataKey="coveragePercent"
                fill="var(--color-coveragePercent)"
                radius={[0, 4, 4, 0]}
                barSize={22}
              />
            </BarChart>
          </ChartContainer>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {data.coverage.nodes.map((node) => (
              <div key={node.id} className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-900">{node.label}</span>
                  <span className="text-xs font-bold text-gray-500">
                    Target {Math.round(node.completionThreshold * 100)}%
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-gray-500">{node.description}</p>
              </div>
            ))}
          </div>
        </SurveyAnalyticsCard>
      </section>

      <section className="grid grid-cols-1 gap-8 border-t border-gray-100 pt-8 md:grid-cols-2">
        <SurveyAnalyticsListCard
          title="Recommendations"
          items={data.recommendations}
          emptyMessage="No recommendations were generated yet."
        />
        <SurveyAnalyticsListCard
          title="Data Gaps"
          items={data.dataGaps}
          emptyMessage="No major data gaps were flagged in the latest snapshot."
        />
      </section>

      <section className="space-y-6 border-t border-gray-100 pt-8">
        <SurveyAnalyticsSectionHeading
          title="Key Quotes"
          description="A small evidence sample from the stored records."
        />
        {data.keyQuotes.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.keyQuotes.map((quote) => (
              <blockquote
                key={quote.id}
                className="rounded-[2rem] border border-gray-100 bg-white p-5 text-sm italic leading-relaxed text-gray-700 shadow-sm"
              >
                &quot;{quote.excerpt}&quot;
                <div className="mt-3 text-[11px] font-medium not-italic text-gray-400">
                  {quote.nodeId} • reliability {quote.reliability}%
                </div>
              </blockquote>
            ))}
          </div>
        ) : (
          <SurveyAnalyticsEmptyState message="No key quotes available yet." />
        )}
      </section>

      <div id="sessions" className="flex justify-center pt-12">
        <Link
          href={`/dashboard/surveys/${surveyId}/analytics/conversations`}
          className="mr-4 rounded-full border border-gray-200 bg-white px-6 py-4 text-sm font-bold text-gray-900 shadow-sm transition-all hover:bg-gray-50"
        >
          Review session insights
        </Link>
        <Link
          id="chat"
          href={`/dashboard/surveys/${surveyId}/analytics/chat`}
          className="group flex items-center gap-3 rounded-full bg-gray-900 px-8 py-4 text-white shadow-xl shadow-gray-200 transition-all hover:bg-black hover:shadow-black/10"
        >
          <span className="font-bold tracking-tight">Deep Dive with AI</span>
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}

function SnapshotTimelineStat({
  label,
  value,
  selected,
}: {
  label: string;
  value: string;
  selected: boolean;
}) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", selected ? "bg-white/10" : "bg-gray-50")}>
      <div className={cn("text-[10px] font-bold uppercase tracking-widest", selected ? "text-gray-300" : "text-gray-400")}>
        {label}
      </div>
      <div className="mt-1 text-lg font-black tracking-tight">{value}</div>
    </div>
  );
}

function SnapshotDeltaCard({
  label,
  delta,
  suffix = "",
}: {
  label: string;
  delta: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className={cn("mt-2 text-xl font-black tracking-tight", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
        {delta >= 0 ? "+" : ""}{delta}{suffix ? ` ${suffix}` : ""}
      </div>
    </div>
  );
}

function SnapshotChangeList({
  added,
  removed,
  addedLabel,
  removedLabel,
}: {
  added: string[];
  removed: string[];
  addedLabel: string;
  removedLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{addedLabel}</div>
        {added.length > 0 ? (
          <div className="space-y-2">
            {added.map((item) => (
              <div key={item} className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {item}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Nothing added.</div>
        )}
      </div>
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{removedLabel}</div>
        {removed.length > 0 ? (
          <div className="space-y-2">
            {removed.map((item) => (
              <div key={item} className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {item}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Nothing removed.</div>
        )}
      </div>
    </div>
  );
}

function SurveyAnalyticsSectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h3>
      <p className="max-w-2xl text-sm leading-relaxed text-gray-500">{description}</p>
    </div>
  );
}

function SurveyAnalyticsSummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <SurveyAnalyticsCard className="p-5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-gray-900">
        {value}
      </div>
      <div className="mt-2 text-xs leading-relaxed text-gray-500">{helper}</div>
    </SurveyAnalyticsCard>
  );
}

function SurveyAnalyticsBriefCard({
  title,
  body,
  details,
}: {
  title: string;
  body: string;
  details: string[];
}) {
  return (
    <SurveyAnalyticsCard>
      <CardHeader className="space-y-3 pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-widest text-gray-400">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-gray-700">{body}</p>
        {details.length > 0 && (
          <div className="space-y-2 pt-1">
            {details.slice(0, 4).map((detail) => (
              <div key={detail} className="text-xs leading-relaxed text-gray-500">
                {detail}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </SurveyAnalyticsCard>
  );
}

function SurveyAnalyticsListCard({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: string[];
  emptyMessage: string;
}) {
  return (
    <SurveyAnalyticsCard>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-bold tracking-tight text-gray-900">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="space-y-3">
            {items.map((item, index) => (
              <li key={`${title}-${index}`} className="flex gap-3 text-sm leading-relaxed text-gray-600">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        )}
      </CardContent>
    </SurveyAnalyticsCard>
  );
}

function SurveyAnalyticsEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}
