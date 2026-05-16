import { ChevronLeft, ChevronRight } from "lucide-react";

import { Link } from "@/i18n/routing";
import type { getClassroomStudentReportDetailData } from "@/lib/server/app-queries";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function TeacherStudentReportDetailPage({
  initialReport,
}: {
  initialReport: Awaited<ReturnType<typeof getClassroomStudentReportDetailData>>;
}) {
  const { student, topic, report, masteryPercent, updatedAt } = initialReport.data;

  return (
    <div className="mx-auto max-w-[1120px] space-y-8 px-2 pb-12">
      <Link
        href={`/dashboard/learning/students/${student.id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <ChevronLeft className="h-4 w-4" />
        </div>
        Back to student
      </Link>

      <section className="border-b border-slate-200 pb-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Tutoring report
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{student.fullName}</span>
            <span>&bull;</span>
            <span>{topic.title}</span>
            <span>&bull;</span>
            <span>{student.classroom.title}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Mastery",
            value: `${masteryPercent}%`,
            helper: "Stored session mastery signal",
          },
          {
            label: "Confidence",
            value:
              report.studentConfidenceScore != null
                ? `${report.studentConfidenceScore}/10`
                : "N/A",
            helper: "Teacher-facing confidence estimate",
          },
          {
            label: "Transfer readiness",
            value: formatStatusLabel(report.transferReadiness),
            helper: "How ready the learner is to apply the concept elsewhere",
          },
          {
            label: "Updated",
            value: formatDate(updatedAt),
            helper: "Latest persisted report timestamp",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-4"
          >
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
              {item.label}
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-950">
              {item.value}
            </div>
            <div className="mt-2 text-sm text-slate-500">{item.helper}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Report overview
          </h2>
        </div>
        <div className="space-y-6 px-6 py-5">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
              Student summary
            </div>
            <p className="max-w-4xl text-sm leading-6 text-slate-700">
              {report.studentSummary}
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
              Pedagogical summary
            </div>
            <p className="max-w-4xl text-sm leading-6 text-slate-700">
              {report.pedagogicalSummary || "No pedagogical summary recorded."}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Comparison trend
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {formatStatusLabel(report.comparisonTrend)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Intervention
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {formatStatusLabel(report.recommendedInterventionType)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Topic status
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {formatStatusLabel(topic.status)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Concept progress
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {report.conceptProgress.length ? (
            report.conceptProgress.map((concept) => (
              <div
                key={`${concept.conceptKey}-${concept.title}`}
                className="space-y-3 px-6 py-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      {concept.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {formatStatusLabel(concept.masteryLevel)}
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    {Math.round(concept.confidence * 100)}% confidence
                  </div>
                </div>
                {concept.misconceptions.length ? (
                  <div className="text-sm text-slate-700">
                    Misconceptions: {concept.misconceptions.join(", ")}
                  </div>
                ) : null}
                {concept.evidence.length ? (
                  <div className="text-sm text-slate-500">
                    Evidence: {concept.evidence.join(" | ")}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">
              No concept-progress items were recorded for this report.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Teacher actions and gaps
            </h2>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Identified gaps
              </div>
              <div className="mt-3 space-y-2">
                {report.identifiedGaps.length ? (
                  report.identifiedGaps.map((gap) => (
                    <div key={gap} className="text-sm text-slate-700">
                      {gap}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No gaps recorded.</div>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Recommended teacher actions
              </div>
              <div className="mt-3 space-y-2">
                {report.recommendedTeacherActions.length ? (
                  report.recommendedTeacherActions.map((action) => (
                    <div key={action} className="text-sm text-slate-700">
                      {action}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">
                    No teacher actions recorded.
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Homework assigned
              </div>
              <div className="mt-3 space-y-2">
                {report.homeworkAssigned.length ? (
                  report.homeworkAssigned.map((item) => (
                    <div key={item} className="text-sm text-slate-700">
                      {item}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">
                    No homework recorded.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Reflection and follow-up
            </h2>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Productive struggle notes
              </div>
              <div className="mt-3 space-y-2">
                {report.productiveStruggleNotes.length ? (
                  report.productiveStruggleNotes.map((note) => (
                    <div key={note} className="text-sm text-slate-700">
                      {note}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">
                    No struggle notes recorded.
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Longitudinal signals
              </div>
              <div className="mt-3 space-y-2">
                {report.longitudinalSignals.length ? (
                  report.longitudinalSignals.map((signal) => (
                    <div key={signal} className="text-sm text-slate-700">
                      {signal}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">
                    No longitudinal signals recorded.
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Metacognitive mirror
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {report.metacognitiveMirror || "No metacognitive reflection recorded."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Link
          href={`/dashboard/learning/topics/${topic.id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
        >
          Open topic
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
