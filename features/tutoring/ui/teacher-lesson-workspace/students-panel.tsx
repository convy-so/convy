"use client";

import { ExternalLink, Users } from "lucide-react";

import { Link } from "@/i18n/routing";

import type { TopicStudent } from "./workspace-model";

export function TeacherLessonStudentsPanel(props: {
  students: TopicStudent[];
  openInviteModal: () => void;
}) {
  const { students, openInviteModal } = props;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Students
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Students attached to this session through the classroom roster.
          </p>
        </div>
        <button
          type="button"
          onClick={openInviteModal}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <Users className="h-4 w-4" />
          Add students
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {students.length ? (
          students.map((student, index) => (
            <div
              key={student.id}
              className={`px-5 py-4 ${index !== students.length - 1 ? "border-b border-slate-100" : ""}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">
                    {student.fullName}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-500">
                    {student.email}
                  </div>
                </div>

                <Link
                  href={`/dashboard/learning/students/${student.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                >
                  Profile
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="px-5 py-10 text-sm text-slate-500">
            No students are attached to this classroom yet.
          </div>
        )}
      </div>
    </section>
  );
}
