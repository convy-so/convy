"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, FileText, Loader2, MessageSquare, Sparkles } from "lucide-react";

import { Link } from "@/i18n/routing";
import {
  fetchTopicMaterials,
  fetchTopicOverview,
  fetchTopicQuestions,
  fetchTopicReadiness,
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

export function TeacherTopicDetailPage({ topicId }: { topicId: string }) {
  const overviewQuery = useQuery({
    queryKey: queryKeys.learning.topicOverview(topicId),
    queryFn: () => fetchTopicOverview(topicId),
  });
  const materialsQuery = useQuery({
    queryKey: queryKeys.learning.materials(topicId),
    queryFn: () => fetchTopicMaterials(topicId),
  });
  const readinessQuery = useQuery({
    queryKey: queryKeys.learning.readiness(topicId),
    queryFn: () => fetchTopicReadiness(topicId),
  });
  const reportsQuery = useQuery({
    queryKey: queryKeys.learning.reports(topicId),
    queryFn: () => fetchTopicReports(topicId),
  });
  const questionsQuery = useQuery({
    queryKey: queryKeys.learning.questions(topicId),
    queryFn: () => fetchTopicQuestions(topicId),
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-2">
        <GlassPanel className="flex items-center gap-3 px-6 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <span className="text-sm text-slate-600">Loading topic view...</span>
        </GlassPanel>
      </div>
    );
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <div className="mx-auto max-w-[1200px] px-2 pb-12">
        <GlassPanel className="px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Topic view unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {overviewQuery.error instanceof Error
              ? overviewQuery.error.message
              : "We could not load this topic right now."}
          </p>
        </GlassPanel>
      </div>
    );
  }

  const { topic, reportCount, questionCount, activeStudentCount } = overviewQuery.data.data;
  const readiness = readinessQuery.data?.data ?? null;
  const reports = reportsQuery.data?.data ?? [];
  const questions = questionsQuery.data?.data ?? [];
  const materials = materialsQuery.data?.data ?? [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              Topic Detail
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                {topic.title}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {topic.classroom.title} · {topic.subjectLabel} · {topic.status}
              </p>
              {topic.description ? (
                <p className="max-w-3xl text-sm leading-7 text-slate-600">
                  {topic.description}
                </p>
              ) : null}
            </div>
          </div>

          <GlassPanel className="grid gap-4 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Topic metrics
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTile label="Materials" value={String(materials.length)} helper="Teacher-uploaded materials currently grounding the tutor." />
              <MetricTile label="Reports" value={String(reportCount)} helper="Session reports already generated for this topic." />
              <MetricTile label="Questions" value={String(questionCount)} helper="Question traffic including between-session help." />
              <MetricTile label="Students" value={String(activeStudentCount)} helper="Accepted students attached to the classroom." />
            </div>
          </GlassPanel>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <GlassPanel className="p-6">
            <SectionHeading
              eyebrow="Grounding"
              title="Materials and readiness"
              description="This is the teacher-approved knowledge boundary and the current readiness judgment for releasing the topic."
            />

            <div className="mt-6 space-y-4">
              <div className="rounded-[20px] border border-white/70 bg-white/75 p-5">
                <div className="flex items-center gap-2 text-slate-950">
                  <FileText className="h-4 w-4 text-sky-700" />
                  <div className="text-sm font-semibold text-slate-950">Source materials</div>
                </div>
                <div className="mt-4 space-y-3">
                  {materialsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading materials...
                    </div>
                  ) : materials.length ? (
                    materials.map((material) => (
                      <div key={material.id} className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{material.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {material.materialKind} · {material.mimeType}
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-slate-500">
                            <div>{material.extractionStatus}</div>
                            <div className="mt-1">{material.indexingStatus}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">No material uploaded yet.</div>
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/70 bg-white/75 p-5">
                <div className="flex items-center gap-2 text-slate-950">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <div className="text-sm font-semibold text-slate-950">Readiness</div>
                </div>
                {readinessQuery.isLoading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reviewing readiness...
                  </div>
                ) : readiness ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-4">
                      <div className="text-sm font-semibold text-slate-950">
                        {readiness.summary}
                      </div>
                    </div>
                    {readiness.clarifyingQuestions.length ? (
                      <div className="space-y-2">
                        {readiness.clarifyingQuestions.map((question) => (
                          <div key={question} className="rounded-[16px] border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                            {question}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-slate-500">No readiness summary yet.</div>
                )}
              </div>
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <BookOpen className="h-4 w-4 text-violet-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Report stream
              </h2>
            </div>
            <div className="mt-6 space-y-4">
              {reports.length ? (
                reports.map((report) => (
                  <div key={report.id} className="rounded-[20px] border border-white/70 bg-white/75 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Link href={`/dashboard/learning/students/${report.student.id}`} className="text-sm font-semibold text-slate-950 transition hover:text-sky-700">
                          {report.student.fullName}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500">{formatDate(report.updatedAt)}</div>
                      </div>
                      <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {report.masteryPercent}% mastery
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {report.report.studentSummary}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-sm text-slate-500">
                  No reports yet for this topic.
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <MessageSquare className="h-4 w-4 text-sky-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Question stream
              </h2>
            </div>
            <div className="mt-6 space-y-4">
              {questions.length ? (
                questions.map((question) => (
                  <div key={question.id} className="rounded-[18px] border border-white/70 bg-white/75 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">
                        {question.student.fullName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(question.createdAt)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {question.interactionType}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {question.content}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">
                  No questions logged yet for this topic.
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </section>
    </div>
  );
}
