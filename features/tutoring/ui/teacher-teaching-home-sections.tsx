"use client";

import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Layout,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";

import { Link } from "@/i18n/routing";
import { getSubjectDisplayLabel } from "@/features/tutoring/server/subject-packages";
import type { useTeacherTeachingWorkspace } from "@/features/tutoring/client/hooks/use-teacher-teaching-workspace";
import { appLocaleLabels } from "@/shared/i18n/config";

type TeacherTeachingWorkspaceData = ReturnType<typeof useTeacherTeachingWorkspace>;
type ClassroomRecord = TeacherTeachingWorkspaceData["classrooms"][number];
type StudentRecord = TeacherTeachingWorkspaceData["students"][number];
type PendingInvitationRecord =
  TeacherTeachingWorkspaceData["pendingInvitations"][number];
type LessonRecord = TeacherTeachingWorkspaceData["lessons"][number];

export type TeacherClassroomView = "sessions" | "students" | "details";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatLessonStatusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type TeacherClassroomsDirectoryProps = {
  classrooms: ClassroomRecord[];
  visibleClassrooms: ClassroomRecord[];
  effectiveClassroomPage: number;
  classroomPageCount: number;
  classroomsPageSize: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onSelectClassroom: (classroomId: string) => void;
  onOpenCreateClassroom: () => void;
};

export function TeacherClassroomsDirectory({
  classrooms,
  visibleClassrooms,
  effectiveClassroomPage,
  classroomPageCount,
  classroomsPageSize,
  onPreviousPage,
  onNextPage,
  onSelectClassroom,
  onOpenCreateClassroom,
}: TeacherClassroomsDirectoryProps) {
  if (!classrooms.length) {
    return (
      <section className="space-y-5">
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-8 py-20 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
            <Layout className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="mt-6 text-xl font-semibold text-slate-950">
            No classrooms yet
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Create your first classroom to begin inviting students and defining
            student sessions.
          </p>
          <button
            type="button"
            onClick={onOpenCreateClassroom}
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Create classroom
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_-40px_rgba(15,23,42,0.24)]">
        <div className="border-b border-slate-100 px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Classrooms
          </h1>
        </div>

        <div className="divide-y divide-slate-100">
          {visibleClassrooms.map((classroom) => (
            <button
              key={classroom.id}
              type="button"
              onClick={() => onSelectClassroom(classroom.id)}
              className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-950 transition group-hover:text-sky-700">
                  {classroom.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span>{classroom.gradeLabel}</span>
                  <span>/</span>
                  <span>Teacher workspace</span>
                  <span>{appLocaleLabels[classroom.defaultContentLocale]}</span>
                </div>
              </div>

              <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>
              Page {effectiveClassroomPage} of {classroomPageCount}
            </span>
            {classrooms.length > classroomsPageSize ? (
              <span>/ {classrooms.length} total classrooms</span>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {classroomPageCount > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPreviousPage}
                  disabled={effectiveClassroomPage === 1}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={onNextPage}
                  disabled={effectiveClassroomPage === classroomPageCount}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onOpenCreateClassroom}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Create classroom
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

type TeacherClassroomWorkspaceProps = {
  selectedDirectoryClassroom: ClassroomRecord;
  activeClassroomView: TeacherClassroomView;
  lessons: LessonRecord[];
  students: StudentRecord[];
  pendingInvitations: PendingInvitationRecord[];
  canManageStudents: boolean;
  activeSessionCount: number;
  draftSessionCount: number;
  pausedSessionCount: number;
  archivedSessionCount: number;
  acceptedStudentCount: number;
  onboardingReadyCount: number;
  resendInvitationMutation: TeacherTeachingWorkspaceData["resendInvitationMutation"];
  cancelInvitationMutation: TeacherTeachingWorkspaceData["cancelInvitationMutation"];
  onBackToClassrooms: () => void;
  onChangeView: (view: TeacherClassroomView) => void;
  onSelectLesson: (lessonId: string) => void;
  onOpenInviteModal: () => void;
  onOpenCreateLessonModal: () => void;
};

export function TeacherClassroomWorkspace({
  selectedDirectoryClassroom,
  activeClassroomView,
  lessons,
  students,
  pendingInvitations,
  canManageStudents,
  activeSessionCount,
  draftSessionCount,
  pausedSessionCount,
  archivedSessionCount,
  acceptedStudentCount,
  onboardingReadyCount,
  resendInvitationMutation,
  cancelInvitationMutation,
  onBackToClassrooms,
  onChangeView,
  onSelectLesson,
  onOpenInviteModal,
  onOpenCreateLessonModal,
}: TeacherClassroomWorkspaceProps) {
  return (
    <>
      <button
        type="button"
        onClick={onBackToClassrooms}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <ChevronDown className="h-4 w-4 rotate-90" />
        </div>
        Back to classrooms
      </button>

      <section className="border-b border-slate-200 pb-6">
        <div className="space-y-2">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {selectedDirectoryClassroom.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{selectedDirectoryClassroom.gradeLabel}</span>
              <span>/</span>
              <span>Teacher workspace</span>
              <span>
                {appLocaleLabels[selectedDirectoryClassroom.defaultContentLocale]}
              </span>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Choose a session to inspect reports and analytics, or manage the
              classroom roster here before opening a specific session.
            </p>
          </div>
        </div>
      </section>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => onChangeView("sessions")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeClassroomView === "sessions"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Sessions
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {lessons.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChangeView("students")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeClassroomView === "students"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Users className="h-4 w-4" />
            Students
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {students.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChangeView("details")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeClassroomView === "details"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Layout className="h-4 w-4" />
            Details
          </button>
        </nav>
      </div>

      {activeClassroomView === "sessions" ? (
        <TeacherClassroomSessionsPanel
          lessons={lessons}
          activeSessionCount={activeSessionCount}
          onSelectLesson={onSelectLesson}
          onOpenCreateLessonModal={onOpenCreateLessonModal}
        />
      ) : activeClassroomView === "students" ? (
        <TeacherClassroomStudentsPanel
          students={students}
          pendingInvitations={pendingInvitations}
          canManageStudents={canManageStudents}
          resendInvitationMutation={resendInvitationMutation}
          cancelInvitationMutation={cancelInvitationMutation}
          onOpenInviteModal={onOpenInviteModal}
        />
      ) : (
        <TeacherClassroomDetailsPanel
          selectedDirectoryClassroom={selectedDirectoryClassroom}
          lessons={lessons}
          students={students}
          pendingInvitations={pendingInvitations}
          activeSessionCount={activeSessionCount}
          draftSessionCount={draftSessionCount}
          pausedSessionCount={pausedSessionCount}
          archivedSessionCount={archivedSessionCount}
          acceptedStudentCount={acceptedStudentCount}
          onboardingReadyCount={onboardingReadyCount}
        />
      )}
    </>
  );
}

type TeacherClassroomSessionsPanelProps = {
  lessons: LessonRecord[];
  activeSessionCount: number;
  onSelectLesson: (lessonId: string) => void;
  onOpenCreateLessonModal: () => void;
};

function TeacherClassroomSessionsPanel({
  lessons,
  activeSessionCount,
  onSelectLesson,
  onOpenCreateLessonModal,
}: TeacherClassroomSessionsPanelProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Sessions
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Open a session to inspect its reports, readiness, supporting
            materials, and student performance.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>{lessons.length} total</span>
          <span>/</span>
          <span>{activeSessionCount} active</span>
        </div>
      </div>

      {lessons.length ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenCreateLessonModal}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Create session
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {lessons.length ? (
          lessons.map((lesson, index) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => onSelectLesson(lesson.id)}
              className={`group w-full px-5 py-4 text-left transition hover:bg-slate-50/70 ${
                index !== lessons.length - 1 ? "border-b border-slate-100" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      {formatLessonStatusLabel(lesson.status)}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      {lesson.courseTitle ?? getSubjectDisplayLabel(null)}
                    </span>
                  </div>
                  <div>
                    <div className="truncate text-base font-semibold text-slate-950 transition group-hover:text-slate-700">
                      {lesson.title}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">
                      {lesson.description ??
                        "Open this session to review its readiness, supporting materials, and student evidence."}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">
                    {appLocaleLabels[lesson.contentLocale ?? "en"]}
                  </div>
                </div>

                <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-500" />
              </div>
            </button>
          ))
        ) : (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white">
              <BookOpen className="h-6 w-6 text-slate-200" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-950">
              No sessions yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Create the first session for this classroom. That session will
              define the learning scope students enter.
            </p>
            <button
              type="button"
              onClick={onOpenCreateLessonModal}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Create first session
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

type TeacherClassroomStudentsPanelProps = {
  students: StudentRecord[];
  pendingInvitations: PendingInvitationRecord[];
  canManageStudents: boolean;
  resendInvitationMutation: TeacherTeachingWorkspaceData["resendInvitationMutation"];
  cancelInvitationMutation: TeacherTeachingWorkspaceData["cancelInvitationMutation"];
  onOpenInviteModal: () => void;
};

function TeacherClassroomStudentsPanel({
  students,
  pendingInvitations,
  canManageStudents,
  resendInvitationMutation,
  cancelInvitationMutation,
  onOpenInviteModal,
}: TeacherClassroomStudentsPanelProps) {
  return (
    <section className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Students
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Manage the roster here before opening a specific session.
          </p>
        </div>
        {canManageStudents ? (
          <button
            type="button"
            onClick={onOpenInviteModal}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Invite
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {students.length ? (
          students.map((student, index) => (
            <div
              key={student.id}
              className={`px-5 py-4 ${
                index !== students.length - 1 ? "border-b border-slate-100" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">
                    {student.fullName}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-500">
                    {student.email}
                  </div>
                  <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    {student.inviteStatus}
                  </div>
                </div>

                <Link
                  href={`/dashboard/teaching/students/${student.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                >
                  Open
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white">
              <Users className="h-6 w-6 text-slate-200" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-950">
              No students enrolled
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Invite students to this classroom so they appear here before you
              open a session.
            </p>
          </div>
        )}
      </div>

      {pendingInvitations.length ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Pending invitations
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Track invites that have been sent but not yet accepted.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {pendingInvitations.map((invitation, index) => (
              <div
                key={invitation.id}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${
                  index !== pendingInvitations.length - 1
                    ? "border-b border-slate-100"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {invitation.email}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Invited {formatDate(invitation.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resendInvitationMutation.mutate(invitation)}
                    disabled={resendInvitationMutation.isPending}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-sky-100 hover:text-sky-600 disabled:opacity-50"
                    title="Resend invitation"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${
                        resendInvitationMutation.isPending ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelInvitationMutation.mutate(invitation)}
                    disabled={cancelInvitationMutation.isPending}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-rose-100 hover:text-rose-600 disabled:opacity-50"
                    title="Cancel invitation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

type TeacherClassroomDetailsPanelProps = {
  selectedDirectoryClassroom: ClassroomRecord;
  lessons: LessonRecord[];
  students: StudentRecord[];
  pendingInvitations: PendingInvitationRecord[];
  activeSessionCount: number;
  draftSessionCount: number;
  pausedSessionCount: number;
  archivedSessionCount: number;
  acceptedStudentCount: number;
  onboardingReadyCount: number;
};

function TeacherClassroomDetailsPanel({
  selectedDirectoryClassroom,
  lessons,
  students,
  pendingInvitations,
  activeSessionCount,
  draftSessionCount,
  pausedSessionCount,
  archivedSessionCount,
  acceptedStudentCount,
  onboardingReadyCount,
}: TeacherClassroomDetailsPanelProps) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          Classroom details
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Core classroom information, roster readiness, and session setup.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Students</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {students.length}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {acceptedStudentCount} accepted
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Sessions</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {lessons.length}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {activeSessionCount} active
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Pending invites</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {pendingInvitations.length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Awaiting acceptance</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Onboarding ready</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {onboardingReadyCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Students fully set up
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-semibold text-slate-950">
              Classroom metadata
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <span className="text-slate-500">Title</span>
              <span className="font-medium text-slate-900">
                {selectedDirectoryClassroom.title}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <span className="text-slate-500">Grade</span>
              <span className="font-medium text-slate-900">
                {selectedDirectoryClassroom.gradeLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <span className="text-slate-500">Default language</span>
              <span className="font-medium text-slate-900">
                {appLocaleLabels[selectedDirectoryClassroom.defaultContentLocale]}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-semibold text-slate-950">
              Session status mix
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <span className="text-slate-500">Draft</span>
              <span className="font-medium text-slate-900">
                {draftSessionCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <span className="text-slate-500">Active</span>
              <span className="font-medium text-slate-900">
                {activeSessionCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <span className="text-slate-500">Paused</span>
              <span className="font-medium text-slate-900">
                {pausedSessionCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <span className="text-slate-500">Archived</span>
              <span className="font-medium text-slate-900">
                {archivedSessionCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
