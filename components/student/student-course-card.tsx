"use client";

import { AlertCircle, ArrowRight, Clock, FileText, Sparkles } from "lucide-react";
import { Link } from "@/i18n/routing";
import { getSubjectDisplayLabel } from "@/lib/learning/subject-packages";
import { classroomInitials } from "@/lib/student-course-accents";
import { cn } from "@/lib/utils";

export type StudentCourseCardMembership = {
  classroomStudentId: string;
  needsOnboarding: boolean;
  classroom: {
    id: string;
    title: string;
    gradeLabel: string;
  };
  topics: Array<{ id: string; subject?: string | null; subjectKey?: string | null }>;
};

type Props = {
  membership: StudentCourseCardMembership;
  isActive?: boolean;
  onSelect?: () => void;
  variant?: "selectable" | "actions";
};

export function StudentCourseCard({
  membership,
  isActive = false,
  onSelect,
  variant = "selectable",
}: Props) {
  const shellClass = cn(
    "flex w-full flex-col rounded-2xl border bg-white p-6 text-left shadow-sm transition-colors",
    isActive ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300",
    onSelect && "cursor-pointer",
  );

  const content = (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold uppercase text-gray-700"
          aria-hidden
        >
          {classroomInitials(membership.classroom.title)}
        </div>
        <div className="flex min-w-0 flex-col items-end text-right">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {membership.classroom.gradeLabel}
          </span>
          {membership.needsOnboarding && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
              <AlertCircle className="h-3 w-3" aria-hidden />
              Setup
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold leading-snug text-gray-900">{membership.classroom.title}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-600">
            <Clock className="h-3 w-3" aria-hidden />
            {membership.topics.length} topic{membership.topics.length === 1 ? "" : "s"}
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            <Sparkles className="h-3 w-3 text-emerald-600" aria-hidden />
            Active
          </div>
        </div>
      </div>

      {variant === "actions" ? (
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-gray-100 pt-4">
          <Link
            href={`/student/dashboard?classroomId=${membership.classroom.id}`}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-gray-800"
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href={`/student/progress?classroomId=${membership.classroom.id}`}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-3 text-xs font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
          >
            <FileText className="h-3.5 w-3.5 text-gray-500" aria-hidden />
            Progress
          </Link>
        </div>
      ) : (
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {membership.topics[0]?.subject ?? getSubjectDisplayLabel(membership.topics[0]?.subjectKey)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold",
              isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700",
            )}
          >
            {isActive ? "Selected" : "Open"}
            <ArrowRight className={cn("h-3.5 w-3.5", isActive && "translate-x-0.5")} aria-hidden />
          </span>
        </div>
      )}
    </div>
  );

  if (onSelect) {
    return (
      <button type="button" className={shellClass} onClick={onSelect}>
        {content}
      </button>
    );
  }

  return <div className={shellClass}>{content}</div>;
}
