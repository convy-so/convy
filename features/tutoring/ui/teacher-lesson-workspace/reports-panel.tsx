"use client";

import { FileText } from "lucide-react";

import { Link } from "@/i18n/routing";

import type { TopicReport } from "./workspace-model";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function TeacherLessonReportsPanel({ reports }: { reports: TopicReport[] }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Reports</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Student report summaries generated from work inside this session.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {reports.length ? (
          reports.map((report, index) => {
            const firstGap = report.report.identifiedGaps?.[0] ?? null;
            return (
              <div
                key={report.id}
                className={`px-5 py-5 ${index !== reports.length - 1 ? "border-b border-slate-100" : ""}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/learning/students/${report.student.id}`}
                      className="text-base font-semibold text-slate-950 transition hover:text-slate-700"
                    >
                      {report.student.fullName}
                    </Link>
                    <div className="mt-1 text-xs text-slate-400">
                      Updated {formatDate(report.updatedAt)}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {report.report.studentSummary}
                    </p>
                    {firstGap ? (
                      <div className="mt-3 text-sm text-slate-500">
                        <span className="font-medium text-slate-900">Main gap:</span>{" "}
                        {firstGap}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                    {report.masteryPercent}% mastery
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white">
              <FileText className="h-6 w-6 text-slate-200" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-950">
              No session reports yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Reports will appear here once students work through this session with the tutor.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
