"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  GraduationCap,
  Loader2,
  MessageSquare,
  Sparkles,
} from "lucide-react";

import { Link } from "@/i18n/routing";
import { fetchStudentOverview, fetchStudentPatterns } from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import { GlassPanel } from "@/components/learning/glass-panel";
import { MetricTile } from "@/components/learning/metric-tile";
import { SectionHeading } from "@/components/learning/section-heading";
import { TeacherStudentChat } from "@/components/learning/teacher-student-chat";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function TeacherStudentDetailPage({ studentId }: { studentId: string }) {
  const overviewQuery = useQuery({
    queryKey: queryKeys.learning.studentOverview(studentId),
    queryFn: () => fetchStudentOverview(studentId),
  });

  const patternsQuery = useQuery({
    queryKey: queryKeys.learning.studentPatterns(studentId),
    queryFn: () => fetchStudentPatterns(studentId),
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-2">
        <GlassPanel className="flex items-center gap-3 px-6 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <span className="text-sm text-slate-600">Loading student view...</span>
        </GlassPanel>
      </div>
    );
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <div className="mx-auto max-w-[1200px] px-2 pb-12">
        <GlassPanel className="px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Student view unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {overviewQuery.error instanceof Error
              ? overviewQuery.error.message
              : "We could not load this student right now."}
          </p>
        </GlassPanel>
      </div>
    );
  }

  const { student, topics, recentReports, recentInteractions } = overviewQuery.data.data;
  const patterns = patternsQuery.data?.data.profiles ?? [];
  const recentRiskFlags = recentReports
    .flatMap((report) => report.report.riskFlags)
    .slice(0, 4);
  const persistentMisconceptions = patterns
    .flatMap((pattern) => pattern.persistentMisconceptions)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.15),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.12),_transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Student Detail
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                {student.fullName}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {student.classroom.title} · {student.classroom.gradeLabel} · {student.email}
              </p>
            </div>
          </div>

          <GlassPanel className="grid gap-4 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Current snapshot
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTile
                label="Topics"
                value={String(topics.length)}
                helper="Topics this student can work through in the classroom."
              />
              <MetricTile
                label="Reports"
                value={String(recentReports.length)}
                helper="Recent report records available from tutoring sessions."
              />
              <MetricTile
                label="Patterns"
                value={String(patterns.length)}
                helper="Learning-pattern overlays currently guiding the tutor."
              />
              <MetricTile
                label="Questions"
                value={String(recentInteractions.length)}
                helper="Recent logged interactions and after-class questions."
              />
            </div>
          </GlassPanel>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <GlassPanel className="p-6">
            <SectionHeading
              eyebrow="Learning patterns"
              title="How the tutor sees this learner"
              description="This card translates the memory system into teacher-ready language you can act on."
            />
            <div className="mt-6 space-y-4">
              {patternsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading patterns...
                </div>
              ) : patterns.length ? (
                patterns.map((pattern) => (
                  <div
                    key={`${pattern.scopeType}-${pattern.subjectKey ?? "global"}`}
                    className="rounded-[20px] border border-white/70 bg-white/75 p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          {pattern.scopeType === "global"
                            ? "Global pattern"
                            : pattern.subjectLabel ?? pattern.subjectKey ?? "Subject pattern"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Confidence: {pattern.confidenceLabel}
                        </div>
                      </div>
                      <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                        {Math.round(pattern.patternConfidence * 100)}%
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {pattern.teacherSummary}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-sm text-slate-500">
                  No pattern profile available yet.
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                What the AI has flagged
              </h2>
            </div>
            <div className="mt-6 space-y-4">
              {recentRiskFlags.length ? (
                recentRiskFlags.map((flag) => (
                  <div
                    key={flag}
                    className="rounded-[18px] border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900"
                  >
                    {flag}
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">
                  No active risk flags from recent reports.
                </div>
              )}

              {persistentMisconceptions.length ? (
                <div className="space-y-3">
                  {persistentMisconceptions.map((misconception) => (
                    <div
                      key={`${misconception.key}-${misconception.lastSeenAt}`}
                      className="rounded-[18px] border border-rose-100 bg-rose-50/80 px-4 py-3"
                    >
                      <div className="text-sm font-semibold text-rose-900">
                        {misconception.label}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-rose-800">
                        {misconception.description}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <GraduationCap className="h-4 w-4 text-sky-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Recent reports
              </h2>
            </div>
            <div className="mt-6 space-y-4">
              {recentReports.length ? (
                recentReports.map((report) => {
                  const identifiedGaps = report.report.identifiedGaps ?? [];

                  return (
                    <div
                      key={report.id}
                      className="rounded-[20px] border border-white/70 bg-white/75 p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Link
                            href={`/dashboard/learning/topics/${report.topicId}`}
                            className="text-sm font-semibold text-slate-950 transition hover:text-sky-700"
                          >
                            {report.topicTitle}
                          </Link>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatDate(report.updatedAt)}
                          </div>
                        </div>
                        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {report.masteryPercent}% mastery
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {report.report.studentSummary}
                      </p>
                      {identifiedGaps.length ? (
                        <div className="mt-4 text-sm text-slate-700">
                          Gap focus: {identifiedGaps[0]}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-sm text-slate-500">
                  No reports yet for this student.
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <MessageSquare className="h-4 w-4 text-violet-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Recent interactions
              </h2>
            </div>
            <div className="mt-6 space-y-4">
              {recentInteractions.length ? (
                recentInteractions.map((interaction) => (
                  <div
                    key={interaction.id}
                    className="rounded-[18px] border border-white/70 bg-white/75 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">
                        {interaction.topicTitle ?? "General interaction"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(interaction.createdAt)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {interaction.interactionType}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {interaction.content}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">
                  No recent interactions logged.
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <Brain className="h-4 w-4 text-emerald-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Topic coverage
              </h2>
            </div>
            <div className="mt-6 space-y-3">
              {topics.map((topic) => (
                <Link
                  key={topic.id}
                  href={`/dashboard/learning/topics/${topic.id}`}
                  className="block rounded-[18px] border border-white/70 bg-white/75 px-4 py-4 transition hover:border-slate-200 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">
                        {topic.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {topic.subjectLabel ?? topic.subject ?? "General"} · {topic.status}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{topic.reportCount} reports</div>
                      <div className="mt-1">
                        {topic.latestMasteryPercent !== null
                          ? `${topic.latestMasteryPercent}%`
                          : "No mastery yet"}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </GlassPanel>
        </div>
      </section>

      <TeacherStudentChat studentId={student.id} studentName={student.fullName} />
    </div>
  );
}
