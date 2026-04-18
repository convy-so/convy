"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  FileText,
  GraduationCap,
  Loader2,
  Sparkles,
} from "lucide-react";

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

type DepartmentOption = {
  id: string;
  name: string;
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function TeacherReportsPage() {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const classroomsQuery = useQuery({
    queryKey: queryKeys.learning.classrooms,
    queryFn: fetchTeacherClassrooms,
  });

  const classrooms = useMemo(() => classroomsQuery.data?.data ?? [], [classroomsQuery.data]);
  const accessibleClassrooms = useMemo(
    () => classrooms.filter((classroom) => classroom.accessLevel !== "none"),
    [classrooms],
  );
  const departmentOptions = useMemo(() => {
    const seenDepartmentIds = new Set<string>();

    return accessibleClassrooms.reduce<DepartmentOption[]>((options, classroom) => {
      if (!classroom.departmentId || seenDepartmentIds.has(classroom.departmentId)) {
        return options;
      }

      seenDepartmentIds.add(classroom.departmentId);
      options.push({
        id: classroom.departmentId,
        name: classroom.departmentName ?? "Unnamed department",
      });
      return options;
    }, []);
  }, [accessibleClassrooms]);
  const effectiveSelectedDepartmentId = departmentOptions.some(
    (department) => department.id === selectedDepartmentId,
  )
    ? selectedDepartmentId
    : null;
  const filteredClassrooms = useMemo(
    () =>
      effectiveSelectedDepartmentId
        ? accessibleClassrooms.filter(
            (classroom) => classroom.departmentId === effectiveSelectedDepartmentId,
          )
        : accessibleClassrooms,
    [accessibleClassrooms, effectiveSelectedDepartmentId],
  );
  const effectiveSelectedClassroomId = filteredClassrooms.some(
    (classroom) => classroom.id === selectedClassroomId,
  )
    ? selectedClassroomId
    : (filteredClassrooms[0]?.id ?? null);
  const selectedClassroom =
    filteredClassrooms.find((classroom) => classroom.id === effectiveSelectedClassroomId) ?? null;

  const topicsQuery = useQuery({
    queryKey: effectiveSelectedClassroomId
      ? queryKeys.learning.topics(effectiveSelectedClassroomId)
      : ["learningTopics", "reports-idle"],
    queryFn: async () => {
      if (!effectiveSelectedClassroomId) {
        throw new Error("Missing classroom id");
      }

      return fetchClassroomTopics(effectiveSelectedClassroomId);
    },
    enabled: Boolean(effectiveSelectedClassroomId),
  });

  const topics = useMemo(() => topicsQuery.data?.data ?? [], [topicsQuery.data]);
  const effectiveSelectedTopicId = topics.some((topic) => topic.id === selectedTopicId)
    ? selectedTopicId
    : (topics[0]?.id ?? null);
  const selectedTopic =
    topics.find((topic) => topic.id === effectiveSelectedTopicId) ?? null;

  const reportsQuery = useQuery({
    queryKey: effectiveSelectedTopicId
      ? queryKeys.learning.reports(effectiveSelectedTopicId)
      : ["learningReports", "idle"],
    queryFn: async () => {
      if (!effectiveSelectedTopicId) {
        throw new Error("Missing topic id");
      }

      return fetchTopicReports(effectiveSelectedTopicId);
    },
    enabled: Boolean(effectiveSelectedTopicId),
  });

  const reportsPayload = reportsQuery.data?.data ?? null;
  const reports = useMemo(() => reportsPayload?.reports ?? [], [reportsPayload]);
  const summary = reportsPayload?.summary ?? null;
  const riskFlagCount = reports.reduce(
    (count, report) => count + (report.report.riskFlags?.length ?? 0),
    0,
  );
  const gapCount = reports.reduce(
    (count, report) => count + (report.report.identifiedGaps?.length ?? 0),
    0,
  );
  const strongestReport = reports[0] ?? null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.12),_transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Class Analytics
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                Review analytics by department, class, and topic.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                The report center stays grounded in teacher-approved classes. Pick a department,
                choose a class, and inspect the topic evidence before acting.
              </p>
            </div>
          </div>

          <GlassPanel className="grid gap-4 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Reporting scope
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTile
                label="Departments"
                value={String(departmentOptions.length)}
                helper="Departments with at least one classroom you can open."
              />
              <MetricTile
                label="Classes"
                value={String(filteredClassrooms.length)}
                helper={
                  effectiveSelectedDepartmentId
                    ? "Accessible classrooms in the selected department."
                    : "Accessible classrooms across the workspace."
                }
              />
              <MetricTile
                label="Students"
                value={String(selectedClassroom?.studentCount ?? 0)}
                helper="Roster size for the selected classroom."
              />
              <MetricTile
                label="Topics"
                value={String(topics.length)}
                helper="Topics currently available in the selected classroom."
              />
            </div>
          </GlassPanel>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <GlassPanel className="p-5">
            <div className="flex items-center gap-2 text-slate-950">
              <Building2 className="h-4 w-4 text-sky-700" />
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Department
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedDepartmentId(null);
                  setSelectedClassroomId(null);
                  setSelectedTopicId(null);
                }}
                className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                  effectiveSelectedDepartmentId === null
                    ? "border-sky-300 bg-sky-50/80"
                    : "border-white/70 bg-white/75 hover:border-slate-200"
                }`}
              >
                <div className="text-sm font-semibold text-slate-950">All departments</div>
                <div className="mt-1 text-xs text-slate-500">
                  View every accessible classroom in this workspace.
                </div>
              </button>
              {departmentOptions.map((department) => (
                <button
                  key={department.id}
                  type="button"
                  onClick={() => {
                    setSelectedDepartmentId(department.id);
                    setSelectedClassroomId(null);
                    setSelectedTopicId(null);
                  }}
                  className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                    effectiveSelectedDepartmentId === department.id
                      ? "border-sky-300 bg-sky-50/80"
                      : "border-white/70 bg-white/75 hover:border-slate-200"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-950">{department.name}</div>
                </button>
              ))}
              {!departmentOptions.length ? (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">
                  No departments with accessible classrooms yet.
                </div>
              ) : null}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Classroom
            </div>
            <div className="mt-4 space-y-3">
              {classroomsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading classrooms...
                </div>
              ) : filteredClassrooms.length ? (
                filteredClassrooms.map((classroom) => (
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
                      {classroom.gradeLabel} - {classroom.studentCount} students
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">
                  No accessible classrooms match this department yet.
                </div>
              )}
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
              ) : topics.length ? (
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
                      {topic.subjectLabel ?? topic.subject ?? "General"} - {topic.status}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">
                  {selectedClassroom
                    ? "No topics available for this classroom yet."
                    : "Choose a classroom to load topic analytics."}
                </div>
              )}
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          <GlassPanel className="p-6">
            <SectionHeading
              eyebrow="Selected topic"
              title={selectedTopic?.title ?? "Choose a topic"}
              description={
                selectedClassroom
                  ? `${selectedClassroom.title}${
                      selectedClassroom.departmentName
                        ? ` in ${selectedClassroom.departmentName}`
                        : ""
                    }. Report cards here are teacher-facing summaries of what the tutoring workflow observed during or around each session.`
                  : "Choose a department and class to inspect topic-level analytics."
              }
            />

            {summary ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="Average mastery"
                  value={
                    summary.averageMasteryPercent != null
                      ? `${Math.round(summary.averageMasteryPercent)}%`
                      : "N/A"
                  }
                  helper="Average across the latest visible student reports for this topic."
                />
                <MetricTile
                  label="Need attention"
                  value={String(summary.studentsNeedingAttention)}
                  helper="Students with low mastery, repeated gaps, low confidence, or flagged concerns."
                />
                <MetricTile
                  label="Average confidence"
                  value={
                    summary.averageConfidenceScore != null
                      ? `${summary.averageConfidenceScore}/10`
                      : "N/A"
                  }
                  helper="Self-reported confidence when the session captured it."
                />
                <MetricTile
                  label="Latest refresh"
                  value={formatDate(summary.latestReportAt)}
                  helper="Most recent report included in this topic view."
                />
              </div>
            ) : null}

            {summary ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[20px] border border-white/70 bg-white/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Common gaps
                  </div>
                  <div className="mt-3 space-y-2">
                    {summary.commonGaps.length ? (
                      summary.commonGaps.map((gap) => (
                        <div key={gap} className="text-sm leading-6 text-slate-700">
                          {gap}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">
                        No repeated conceptual gap stands out yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/70 bg-white/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Risk patterns
                  </div>
                  <div className="mt-3 space-y-2">
                    {summary.commonRiskFlags.length ? (
                      summary.commonRiskFlags.map((flag) => (
                        <div key={flag} className="text-sm leading-6 text-slate-700">
                          {flag}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">
                        No repeated risk signal is currently dominating this topic.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/70 bg-white/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Teacher focus
                  </div>
                  <div className="mt-3 space-y-2">
                    {summary.recommendedTeacherFocus.length ? (
                      summary.recommendedTeacherFocus.map((action) => (
                        <div key={action} className="text-sm leading-6 text-slate-700">
                          {action}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">
                        Teacher follow-up recommendations will appear as more report evidence accumulates.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {!selectedTopic && !reportsQuery.isLoading ? (
              <div className="mt-6 rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-sm text-slate-500">
                Pick a topic to load class analytics.
              </div>
            ) : null}

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

                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <div className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Transfer readiness
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {(report.report.transferReadiness ?? "not_yet").replace("_", " ")}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Originality
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {(report.report.originalityWithinConstraint ?? "low").replace("_", " ")}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Next intervention
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {(report.report.recommendedInterventionType ?? "none").replace("_", " ")}
                          </div>
                        </div>
                      </div>

                      {report.report.metacognitiveMirror ? (
                        <div className="mt-4 rounded-[18px] border border-violet-100 bg-violet-50/70 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">
                            Thinking pattern
                          </div>
                          <div className="mt-2 text-sm leading-6 text-violet-950">
                            {report.report.metacognitiveMirror}
                          </div>
                        </div>
                      ) : null}

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
              ) : selectedTopic ? (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-sm text-slate-500">
                  No reports available yet for this topic.
                </div>
              ) : null}
            </div>
          </GlassPanel>

          <div className="grid gap-6 md:grid-cols-2">
            <GlassPanel className="p-5">
              <div className="flex items-center gap-2 text-slate-950">
                <FileText className="h-4 w-4 text-violet-700" />
                <div className="text-lg font-semibold tracking-tight text-slate-950">
                  Reading guide
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Use mastery, confidence, risk flags, and recurring gaps together. A strong
                score with low confidence and repeated misconceptions may still need teacher
                follow-up.
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
                Start with the class, narrow by topic, and open the student detail page when a
                learner shows recurring risk flags, guarded confidence, or a misconception that
                keeps returning.
              </p>
            </GlassPanel>
          </div>

          <GlassPanel className="grid gap-4 p-5 sm:grid-cols-2">
            <MetricTile
              label="Reports"
              value={String(reports.length)}
              helper="Session reports currently visible for the selected topic."
            />
            <MetricTile
              label="Risk flags"
              value={String(riskFlagCount)}
              helper="Concern signals surfaced by the tutoring engine."
            />
            <MetricTile
              label="Gaps"
              value={String(gapCount)}
              helper="Open conceptual gaps still noted across the report set."
            />
            <MetricTile
              label="Latest"
              value={strongestReport ? formatDate(strongestReport.updatedAt) : "Not yet"}
              helper="Most recent report refresh for the current topic."
            />
          </GlassPanel>
        </div>
      </section>
    </div>
  );
}
