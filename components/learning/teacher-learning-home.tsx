"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  GraduationCap,
  Layout,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { CreateClassroomModal } from "@/components/learning/create-classroom-modal";
import { CreateTopicModal } from "@/components/learning/create-topic-modal";
import { InviteStudentModal } from "@/components/learning/invite-student-modal";
import { LogInterventionModal } from "@/components/learning/log-intervention-modal";
import { StatsCard } from "@/components/dashboard/stats-card";
import { useTeacherLearningWorkspace } from "@/components/learning/hooks/use-teacher-learning-workspace";
import type { getTeacherLearningWorkspaceInitialData } from "@/lib/server/app-queries";
import { appLocaleLabels } from "@/lib/i18n/config";

function countActiveSessions(statuses: string[]) {
  return statuses.filter((status) => status === "active").length;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatInterventionTypeLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatInterventionStatusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTopicStatusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const TOPIC_STATUSES = ["draft", "active", "paused", "archived"] as const;

export function TeacherLearningHome(
  initialData: Awaited<ReturnType<typeof getTeacherLearningWorkspaceInitialData>>,
) {
  const CLASSROOMS_PAGE_SIZE = 8;
  const [activeClassroomView, setActiveClassroomView] = useState<
    "sessions" | "students" | "details"
  >("sessions");
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [classroomPage, setClassroomPage] = useState(1);

  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialFile, setMaterialFile] = useState<File | null>(null);

  const {
    classrooms,
    selectedDirectoryClassroom,
    selectedAccessibleClassroomId,
    canManageStudents,
    students,
    pendingInvitations,
    topics,
    selectedStudent,
    selectedTopic,
    materialsQuery,
    readinessQuery,
    uploadMaterialMutation,
    updateTopicStatusMutation,
    resendInvitationMutation,
    cancelInvitationMutation,
    reports,
    questions,
    interventionsQuery,
    interventions,
    selectedStudentReport,
    patternSummary,
    setSelectedClassroomId,
    setSelectedTopicId,
    setSelectedClassroomStudentId,
  } = useTeacherLearningWorkspace(initialData);

  const materials = materialsQuery.data?.data ?? [];
  const activeSessionCount = countActiveSessions(topics.map((topic) => topic.status));
  const draftSessionCount = topics.filter((topic) => topic.status === "draft").length;
  const pausedSessionCount = topics.filter((topic) => topic.status === "paused").length;
  const archivedSessionCount = topics.filter((topic) => topic.status === "archived").length;
  const acceptedStudentCount = students.filter((student) => student.inviteStatus === "accepted").length;
  const onboardingReadyCount = students.filter(
    (student) => student.onboardingStatus === "completed",
  ).length;
  const averageMastery = reports.length
    ? Math.round(
        reports.reduce((sum, report) => sum + report.masteryPercent, 0) / reports.length,
      )
    : null;
  const classroomPageCount = Math.max(1, Math.ceil(classrooms.length / CLASSROOMS_PAGE_SIZE));
  const effectiveClassroomPage = Math.min(classroomPage, classroomPageCount);
  const visibleClassrooms = useMemo(() => {
    const start = (effectiveClassroomPage - 1) * CLASSROOMS_PAGE_SIZE;
    return classrooms.slice(start, start + CLASSROOMS_PAGE_SIZE);
  }, [classrooms, effectiveClassroomPage]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] pb-20 pt-10">
      <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
        {!selectedDirectoryClassroom ? (
          <>
            <section className="space-y-5">
              {classrooms.length ? (
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
                        onClick={() => {
                          setActiveClassroomView("sessions");
                          setSelectedClassroomId(classroom.id);
                          setSelectedTopicId(null);
                          setSelectedClassroomStudentId(null);
                        }}
                        className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-slate-950 transition group-hover:text-sky-700">
                            {classroom.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            <span>{classroom.gradeLabel}</span>
                            <span>•</span>
                            <span>{classroom.subject ?? "General"}</span>
                            <span>•</span>
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
                      {classrooms.length > CLASSROOMS_PAGE_SIZE ? (
                        <span>• {classrooms.length} total classrooms</span>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {classroomPageCount > 1 ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setClassroomPage((page) => Math.max(1, page - 1))
                            }
                            disabled={effectiveClassroomPage === 1}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setClassroomPage((page) =>
                                Math.min(classroomPageCount, page + 1),
                              )
                            }
                            disabled={effectiveClassroomPage === classroomPageCount}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setIsCreateClassModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        <Plus className="h-4 w-4" />
                        Create classroom
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-8 py-20 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <Layout className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-slate-950">
                    No classrooms yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Create your first classroom to begin inviting students and defining
                    learning sessions.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsCreateClassModalOpen(true)}
                    className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Create classroom
                  </button>
                </div>
              )}
            </section>
          </>
        ) : !selectedTopic ? (
          <>
            <button
              type="button"
              onClick={() => setSelectedClassroomId(null)}
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
                    <span>•</span>
                    <span>{selectedDirectoryClassroom.subject ?? "General"}</span>
                    <span>•</span>
                    <span>{appLocaleLabels[selectedDirectoryClassroom.defaultContentLocale]}</span>
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
                  onClick={() => setActiveClassroomView("sessions")}
                  className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    activeClassroomView === "sessions"
                      ? "border-slate-950 text-slate-950"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  Sessions
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {topics.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveClassroomView("students")}
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
                  onClick={() => setActiveClassroomView("details")}
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
                    <span>{topics.length} total</span>
                    <span>•</span>
                    <span>{activeSessionCount} active</span>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {topics.length ? (
                    topics.map((topic, index) => (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => setSelectedTopicId(topic.id)}
                        className={`group w-full px-5 py-4 text-left transition hover:bg-slate-50/70 ${
                          index !== topics.length - 1 ? "border-b border-slate-100" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                                {formatTopicStatusLabel(topic.status)}
                              </span>
                              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                                {topic.subjectLabel ?? topic.subject ?? "General"}
                              </span>
                            </div>
                            <div>
                              <div className="truncate text-base font-semibold text-slate-950 transition group-hover:text-slate-700">
                                {topic.title}
                              </div>
                              <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">
                                {topic.description ??
                                  "Open this session to review its readiness, supporting materials, and student evidence."}
                              </p>
                            </div>
                            <div className="text-xs text-slate-400">
                              {appLocaleLabels[topic.contentLocale ?? "en"]}
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
                        onClick={() => setIsTopicModalOpen(true)}
                        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        <Plus className="h-4 w-4" />
                        Create first session
                      </button>
                    </div>
                  )}
                </div>
              </section>
            ) : activeClassroomView === "students" ? (
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
                      onClick={() => setIsInviteModalOpen(true)}
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
                            href={`/dashboard/learning/students/${student.id}`}
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
                        Invite students to this classroom so they appear here before
                        you open a session.
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
            ) : (
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
                      {topics.length}
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
                    <div className="mt-1 text-xs text-slate-400">
                      Awaiting acceptance
                    </div>
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
                        <span className="text-slate-500">Subject</span>
                        <span className="font-medium text-slate-900">
                          {selectedDirectoryClassroom.subject ?? "General"}
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
                        <span className="font-medium text-slate-900">{draftSessionCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                        <span className="text-slate-500">Active</span>
                        <span className="font-medium text-slate-900">{activeSessionCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                        <span className="text-slate-500">Paused</span>
                        <span className="font-medium text-slate-900">{pausedSessionCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                        <span className="text-slate-500">Archived</span>
                        <span className="font-medium text-slate-900">{archivedSessionCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelectedTopicId(null)}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
            >
              <div className="rounded-lg border border-slate-200 bg-white p-1.5">
                <ChevronDown className="h-4 w-4 rotate-90" />
              </div>
              Back to {selectedDirectoryClassroom.title}
            </button>

            <section className="rounded-[32px] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.84))] px-6 py-8 shadow-[0_28px_90px_-60px_rgba(15,23,42,0.28)] backdrop-blur md:px-8 md:py-10">
              <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Session detail
                  </div>
                  <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                      {selectedTopic.title}
                    </h1>
                    <p className="text-sm leading-7 text-slate-600 md:text-base">
                      {selectedDirectoryClassroom.title} •{" "}
                      {selectedTopic.subjectLabel ?? selectedTopic.subject ?? "General"} •{" "}
                      {appLocaleLabels[selectedTopic.contentLocale ?? "en"]}
                    </p>
                    <p className="max-w-3xl text-sm leading-7 text-slate-500">
                      {selectedTopic.description ??
                        "Open the evidence below to see how students performed in this session, what was covered, and where follow-up is needed."}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {TOPIC_STATUSES.map((status) => {
                      const isSelected = selectedTopic.status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            updateTopicStatusMutation.mutate({
                              topicId: selectedTopic.id,
                              status,
                            })
                          }
                          disabled={isSelected || updateTopicStatusMutation.isPending}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                            isSelected
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
                          } disabled:opacity-60`}
                        >
                          {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                          {formatTopicStatusLabel(status)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/dashboard/learning/topics/${selectedTopic.id}`}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Full session detail
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/dashboard/learning/reports"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      Report center
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
              <StatsCard
                title="Students"
                value={students.length}
                icon={<Users className="w-6 h-6" />}
                iconColor="bg-violet-50 text-violet-600"
                description="Students attached to this classroom"
              />
              <StatsCard
                title="Reports"
                value={reports.length}
                icon={<FileText className="w-6 h-6" />}
                iconColor="bg-sky-50 text-sky-600"
                description="Generated for this session"
              />
              <StatsCard
                title="Average mastery"
                value={averageMastery != null ? `${averageMastery}%` : "N/A"}
                icon={<Sparkles className="w-6 h-6" />}
                iconColor="bg-emerald-50 text-emerald-600"
                description="Across visible student reports"
              />
              <StatsCard
                title="Knowledge assets"
                value={materials.length}
                icon={<UploadCloud className="w-6 h-6" />}
                iconColor="bg-amber-50 text-amber-600"
                description="Grounding files uploaded for this session"
              />
            </div>

            <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-8">
                <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.24)]">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Session analytics
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      Performance by student
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Each report below is tied to this session and shows how a specific
                      student performed, where they struggled, and what follow-up is
                      most useful.
                    </p>
                  </div>

                  <div className="mt-6 space-y-4">
                    {reports.length ? (
                      reports.map((report) => {
                        const firstGap = report.report.identifiedGaps?.[0] ?? null;
                        const firstRiskFlag = report.report.riskFlags?.[0] ?? null;

                        return (
                          <div
                            key={report.id}
                            className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-5"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <Link
                                  href={`/dashboard/learning/students/${report.student.id}`}
                                  className="text-lg font-semibold text-slate-950 transition hover:text-sky-700"
                                >
                                  {report.student.fullName}
                                </Link>
                                <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                  Updated {formatDate(report.updatedAt)}
                                </div>
                              </div>

                              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                                {report.masteryPercent}% mastery
                              </div>
                            </div>

                            <p className="mt-4 text-sm leading-6 text-slate-600">
                              {report.report.studentSummary}
                            </p>

                            {(firstGap || firstRiskFlag) && (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    Primary gap
                                  </div>
                                  <div className="mt-2 text-sm font-medium text-slate-900">
                                    {firstGap ?? "No major unresolved gap flagged."}
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    Risk signal
                                  </div>
                                  <div className="mt-2 text-sm font-medium text-slate-900">
                                    {firstRiskFlag ?? "No active risk flag recorded."}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-14 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white">
                          <FileText className="h-6 w-6 text-slate-200" />
                        </div>
                        <h3 className="mt-5 text-lg font-semibold text-slate-950">
                          No session reports yet
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                          Reports will appear here once students work through this
                          session with the tutor.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.24)]">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Question stream
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      What students asked in this session
                    </h2>
                  </div>

                  <div className="mt-6 space-y-4">
                    {questions.length ? (
                      questions.map((question) => (
                        <div
                          key={question.id}
                          className="rounded-[22px] border border-slate-200 bg-slate-50/60 px-4 py-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-950">
                              {question.student.fullName}
                            </div>
                            <div className="text-xs text-slate-400">
                              {formatDate(question.createdAt)}
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {question.interactionType}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {question.content}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-sm text-slate-500">
                        No questions have been recorded for this session yet.
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.24)]">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Session brief
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      What this session covers
                    </h2>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 px-5 py-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Coverage summary
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {selectedTopic.description ??
                          "No summary was added for this session yet."}
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 px-5 py-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Readiness
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {readinessQuery.data?.data.summary ??
                          "Upload supporting assets to let the tutor evaluate readiness for this session."}
                      </p>
                      {readinessQuery.data?.data.clarifyingQuestions?.length ? (
                        <div className="mt-4 space-y-2">
                          {readinessQuery.data.data.clarifyingQuestions.map((question) => (
                            <div
                              key={question}
                              className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                            >
                              {question}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.24)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Knowledge assets
                      </div>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        Grounding files for this session
                      </h2>
                    </div>
                    <Link
                      href={`/dashboard/learning/topics/${selectedTopic.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      Open detail
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  <form
                    className="mt-6 space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!materialFile) {
                        toast.error("Choose a file first.");
                        return;
                      }

                      uploadMaterialMutation.mutate(
                        {
                          topicId: selectedTopic.id,
                          file: materialFile,
                          title: materialTitle || undefined,
                          description: materialDescription || undefined,
                        },
                        {
                          onSuccess: () => {
                            setMaterialTitle("");
                            setMaterialDescription("");
                            setMaterialFile(null);
                          },
                        },
                      );
                    }}
                  >
                    <div className="grid gap-4">
                      <input
                        value={materialTitle}
                        onChange={(event) => setMaterialTitle(event.target.value)}
                        placeholder="Asset title"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                      />
                      <textarea
                        value={materialDescription}
                        onChange={(event) => setMaterialDescription(event.target.value)}
                        rows={3}
                        placeholder="How should the tutor use this asset in the session?"
                        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                      />
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition hover:border-slate-300 hover:bg-white">
                        <UploadCloud className="h-7 w-7 text-slate-300" />
                        <div className="mt-4 text-sm font-semibold text-slate-700">
                          {materialFile ? materialFile.name : "Select a file to ground this session"}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          PDF, TXT, MD, DOC, DOCX
                        </div>
                        <input
                          type="file"
                          accept=".pdf,.txt,.md,.doc,.docx"
                          className="hidden"
                          onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={uploadMaterialMutation.isPending || !materialFile}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      {uploadMaterialMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4" />
                      )}
                      Upload asset
                    </button>
                  </form>

                  <div className="mt-6 space-y-3">
                    {materials.length ? (
                      materials.map((material) => (
                        <div
                          key={material.id}
                          className="rounded-[22px] border border-slate-200 bg-slate-50/60 px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-950">
                                {material.title}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                {material.materialKind} • {material.mimeType}
                              </div>
                              <div className="mt-2 text-xs text-slate-500">
                                Extraction: {material.extractionStatus} • Indexing:{" "}
                                {material.indexingStatus}
                              </div>
                            </div>

                            <a
                              href={`/api/media/learning/${material.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                            >
                              Open
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-sm text-slate-500">
                        No assets have been uploaded for this session yet.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.24)]">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Session roster
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      Students and support context
                    </h2>
                  </div>

                  <div className="mt-6 space-y-3">
                    {students.length ? (
                      students.map((student) => {
                        const report = reports.find(
                          (item) => item.student.id === student.id,
                        );
                        const isSelected = selectedStudent?.id === student.id;

                        return (
                          <div
                            key={student.id}
                            className={`rounded-[22px] border px-4 py-4 transition ${
                              isSelected
                                ? "border-violet-200 bg-violet-50/70"
                                : "border-slate-200 bg-slate-50/60"
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <button
                                type="button"
                                onClick={() => setSelectedClassroomStudentId(student.id)}
                                className="min-w-0 text-left"
                              >
                                <div className="truncate text-sm font-semibold text-slate-950">
                                  {student.fullName}
                                </div>
                                <div className="mt-1 truncate text-sm text-slate-500">
                                  {student.email}
                                </div>
                                <div className="mt-2 text-xs font-medium text-slate-400">
                                  {report
                                    ? `${report.masteryPercent}% mastery in this session`
                                    : "No session report yet"}
                                </div>
                              </button>

                              <Link
                                href={`/dashboard/learning/students/${student.id}`}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                              >
                                Profile
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-sm text-slate-500">
                        No students are attached to this classroom yet.
                      </div>
                    )}
                  </div>

                  {selectedStudent ? (
                    <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Selected student
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {selectedStudent.fullName}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {selectedStudent.email}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsInterventionModalOpen(true)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
                        >
                          <Plus className="h-4 w-4" />
                          Log intervention
                        </button>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Session mastery
                          </div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {selectedStudentReport
                              ? `${selectedStudentReport.masteryPercent}%`
                              : "No report yet"}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Pattern summary
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {patternSummary ??
                              "A summarized behavior pattern will appear once enough evidence has been collected."}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Active support notes
                        </div>

                        {interventionsQuery.isLoading ? (
                          <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading interventions...
                          </div>
                        ) : interventions.length ? (
                          <div className="mt-3 space-y-3">
                            {interventions.map((intervention) => (
                              <div
                                key={intervention.id}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-950">
                                      {intervention.title}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-400">
                                      {formatInterventionTypeLabel(intervention.interventionType)}
                                    </div>
                                  </div>
                                  <div className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                    {formatInterventionStatusLabel(intervention.status)}
                                  </div>
                                </div>
                                {intervention.notes ? (
                                  <p className="mt-3 text-sm leading-6 text-slate-600">
                                    {intervention.notes}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-5 text-sm text-slate-500">
                            No interventions recorded for this student in the current
                            context.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      <CreateClassroomModal
        isOpen={isCreateClassModalOpen}
        onClose={() => setIsCreateClassModalOpen(false)}
        onSuccess={(id) => setSelectedClassroomId(id)}
      />

      {selectedAccessibleClassroomId ? (
        <>
          <InviteStudentModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            classroomId={selectedAccessibleClassroomId}
          />
          <CreateTopicModal
            isOpen={isTopicModalOpen}
            onClose={() => setIsTopicModalOpen(false)}
            classroomId={selectedAccessibleClassroomId}
          />
          {selectedStudent ? (
            <LogInterventionModal
              isOpen={isInterventionModalOpen}
              onClose={() => setIsInterventionModalOpen(false)}
              classroomId={selectedAccessibleClassroomId}
              classroomStudentId={selectedStudent.id}
              studentName={selectedStudent.fullName}
              topicId={selectedTopic?.id}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
