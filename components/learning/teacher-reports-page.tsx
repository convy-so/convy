"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, GraduationCap, Loader2, Sparkles } from "lucide-react";

import { Link } from "@/i18n/routing";
import {
  fetchClassroomTopics,
  fetchTeacherClassrooms,
  fetchTopicReports,
} from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import { GlassPanel } from "@/components/learning/glass-panel";
import { MetricTile } from "@/components/learning/metric-tile";
import { SectionHeading } from "@/components/learning/section-heading";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function TeacherReportsPage() {
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const classroomsQuery = useQuery({
    queryKey: queryKeys.learning.classrooms,
    queryFn: fetchTeacherClassrooms,
  });
  const classrooms = useMemo(() => classroomsQuery.data?.data ?? [], [classroomsQuery.data]);
  const effectiveSelectedClassroomId = classrooms.some((classroom) => classroom.id === selectedClassroomId)
    ? selectedClassroomId
    : (classrooms[0]?.id ?? null);

  const topicsQuery = useQuery({
    queryKey: effectiveSelectedClassroomId
      ? queryKeys.learning.topics(effectiveSelectedClassroomId)
      : ["learningTopics", "reports-idle"],
    queryFn: () => fetchClassroomTopics(effectiveSelectedClassroomId!),
    enabled: Boolean(effectiveSelectedClassroomId),
  });
  const topics = useMemo(() => topicsQuery.data?.data ?? [], [topicsQuery.data]);
  const effectiveSelectedTopicId = topics.some((topic) => topic.id === selectedTopicId)
    ? selectedTopicId
    : (topics[0]?.id ?? null);

  const reportsQuery = useQuery({
    queryKey: effectiveSelectedTopicId
      ? queryKeys.learning.reports(effectiveSelectedTopicId)
      : ["learningReports", "idle"],
    queryFn: () => fetchTopicReports(effectiveSelectedTopicId!),
    enabled: Boolean(effectiveSelectedTopicId),
  });

  const selectedTopic =
    topics.find((topic) => topic.id === effectiveSelectedTopicId) ?? null;
  const reports = useMemo(() => reportsQuery.data?.data ?? [], [reportsQuery.data]);
  const riskFlagCount = reports.reduce(
    (count, report) => count + (report.report.riskFlags?.length ?? 0),
    0,
  );
  const gapCount = reports.reduce(
    (count, report) => count + (report.report.identifiedGaps?.length ?? 0),
    0,
  );
  const strongestReport = useMemo(() => reports[0] ?? null, [reports]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.12),_transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Report Center
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                Inspect what the tutor is seeing.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                Review report history, risk flags, unresolved gaps, and student confidence signals for the selected topic.
              </p>
            </div>
          </div>

          <GlassPanel className="grid gap-4 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Report metrics
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTile label="Reports" value={String(reports.length)} helper="Session reports currently visible for the selected topic." />
              <MetricTile label="Risk flags" value={String(riskFlagCount)} helper="Concern signals surfaced by the tutoring engine." />
              <MetricTile label="Gaps" value={String(gapCount)} helper="Open conceptual gaps still noted across the report set." />
              <MetricTile label="Latest" value={strongestReport ? formatDate(strongestReport.updatedAt) : "Not yet"} helper="Most recent report refresh for the current topic." />
            </div>
          </GlassPanel>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <GlassPanel className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Classroom
            </div>
            <div className="mt-4 space-y-3">
              {classrooms.map((classroom) => (
                <button
                  key={classroom.id}
                  type="button"
                  onClick={() => {
                    setSelectedClassroomId(classroom.id);
                    setSelectedTopicId(null);
                  }}
                  className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                    effectiveSelectedClassroomId === classroom.id
                      ? "border-sky-300 bg-sky-50/80"
                      : "border-white/70 bg-white/75 hover:border-slate-200"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-950">{classroom.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {classroom.gradeLabel} · {classroom.gradeBand}
                  </div>
                </button>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Topic
            </div>
            <div className="mt-4 space-y-3">
              {topicsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading topics...
                </div>
              ) : (
                topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setSelectedTopicId(topic.id)}
                    className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                      effectiveSelectedTopicId === topic.id
                        ? "border-emerald-300 bg-emerald-50/80"
                        : "border-white/70 bg-white/75 hover:border-slate-200"
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-950">{topic.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {topic.subjectLabel ?? topic.subject ?? "General"} · {topic.status}
                    </div>
                  </button>
                ))
              )}
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          <GlassPanel className="p-6">
            <SectionHeading
              eyebrow="Selected topic"
              title={selectedTopic?.title ?? "Choose a topic"}
              description="Report cards here are teacher-facing summaries of what the tutoring workflow observed during or around each session."
            />

            <div className="mt-6 space-y-4">
              {reportsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading reports...
                </div>
              ) : reports.length ? (
                reports.map((report) => {
                  const identifiedGaps = report.report.identifiedGaps ?? [];
                  const riskFlags = report.report.riskFlags ?? [];
                  const homeworkAssigned = report.report.homeworkAssigned ?? [];

                  return (
                    <div key={report.id} className="rounded-[20px] border border-white/70 bg-white/75 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Link href={`/dashboard/learning/students/${report.student.id}`} className="text-sm font-semibold text-slate-950 transition hover:text-sky-700">
                            {report.student.fullName}
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

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Gap focus
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {identifiedGaps[0] ?? "No major unresolved gap flagged."}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Confidence
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {report.report.studentConfidenceScore ?? "N/A"} / 10
                          </div>
                        </div>
                      </div>

                      {riskFlags.length ? (
                        <div className="mt-4 rounded-[18px] border border-amber-100 bg-amber-50/80 px-4 py-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                            <AlertTriangle className="h-4 w-4" />
                            AI noticed
                          </div>
                          <div className="mt-2 space-y-2">
                            {riskFlags.map((flag) => (
                              <div key={flag} className="text-sm leading-6 text-amber-900">
                                {flag}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {homeworkAssigned.length ? (
                        <div className="mt-4 rounded-[18px] border border-sky-100 bg-sky-50/80 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                            Homework assigned
                          </div>
                          <div className="mt-2 space-y-2">
                            {homeworkAssigned.map((task) => (
                              <div key={task} className="text-sm leading-6 text-sky-900">
                                {task}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-sm text-slate-500">
                  No reports available yet for this topic.
                </div>
              )}
            </div>
          </GlassPanel>

          <div className="grid gap-6 md:grid-cols-2">
            <GlassPanel className="p-5">
              <div className="flex items-center gap-2 text-slate-950">
                <FileText className="h-4 w-4 text-violet-700" />
                <div className="text-lg font-semibold tracking-tight text-slate-950">
                  Report reading guide
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Use mastery, confidence, risk flags, and recurring gaps together. A strong score with low confidence and repeated misconceptions may still need your attention.
              </p>
            </GlassPanel>

            <GlassPanel className="p-5">
              <div className="flex items-center gap-2 text-slate-950">
                <GraduationCap className="h-4 w-4 text-sky-700" />
                <div className="text-lg font-semibold tracking-tight text-slate-950">
                  Next action
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Open the student detail page when a learner shows recurring risk flags, guarded confidence, or a misconception that keeps returning across reports.
              </p>
            </GlassPanel>
          </div>
        </div>
      </section>
    </div>
  );
}
