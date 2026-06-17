"use client";

import { useMemo, useState } from "react";
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
import { CreateClassroomModal } from "@/components/learning/create-classroom-modal";
import { CreateTopicModal } from "@/components/learning/create-topic-modal";
import { InviteStudentModal } from "@/components/learning/invite-student-modal";
import { TeacherTopicWorkspace } from "@/components/learning/teacher-topic-workspace";
import { useTeacherLearningWorkspace } from "@/components/learning/hooks/use-teacher-learning-workspace";
import type { getTeacherLearningWorkspaceInitialData } from "@/lib/server/app-queries";
import { appLocaleLabels } from "@/lib/i18n/config";
import { getSubjectDisplayLabel } from "@/lib/learning/subject-packages";

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

function formatTopicStatusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
export function TeacherLearningHome(
  initialData: Awaited<ReturnType<typeof getTeacherLearningWorkspaceInitialData>>,
) {
  const CLASSROOMS_PAGE_SIZE = 8;
  const [activeClassroomView, setActiveClassroomView] = useState<
    "sessions" | "students" | "details"
  >("sessions");
  const [activeTopicView, setActiveTopicView] = useState<
    "overview" | "reports" | "students"
  >("overview");
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [classroomPage, setClassroomPage] = useState(1);

  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);

  const {
    classrooms,
    selectedDirectoryClassroom,
    selectedAccessibleClassroomId,
    canManageStudents,
    students,
    pendingInvitations,
    topics,
    selectedTopic,
    materialsQuery,
    materialUploadAttemptsQuery,
    uploadMaterialMutation,
    updateTopicStatusMutation,
    resendInvitationMutation,
    cancelInvitationMutation,
    reports,
    activationState,
    isActivationStateLoading,
    isActivationStateError,
    setSelectedClassroomId,
    setSelectedTopicId,
  } = useTeacherLearningWorkspace(initialData, { activeTopicView });

  const materials = materialsQuery.data?.data ?? [];
  const activeSessionCount = countActiveSessions(topics.map((topic) => topic.status));
  const draftSessionCount = topics.filter((topic) => topic.status === "draft").length;
  const pausedSessionCount = topics.filter((topic) => topic.status === "paused").length;
  const archivedSessionCount = topics.filter((topic) => topic.status === "archived").length;
  const acceptedStudentCount = students.filter((student) => student.inviteStatus === "accepted").length;
  const onboardingReadyCount = students.filter(
    (student) => student.onboardingStatus === "completed",
  ).length;
  const classroomPageCount = Math.max(1, Math.ceil(classrooms.length / CLASSROOMS_PAGE_SIZE));
  const effectiveClassroomPage = Math.min(classroomPage, classroomPageCount);
  const visibleClassrooms = useMemo(() => {
    const start = (effectiveClassroomPage - 1) * CLASSROOMS_PAGE_SIZE;
    return classrooms.slice(start, start + CLASSROOMS_PAGE_SIZE);
  }, [classrooms, effectiveClassroomPage]);

  const handleSelectTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    setActiveTopicView("overview");
  };

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

                {topics.length ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsTopicModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      Create session
                    </button>
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {topics.length ? (
                    topics.map((topic, index) => (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => handleSelectTopic(topic.id)}
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
                                {topic.courseTitle ?? getSubjectDisplayLabel(null)}
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

            <TeacherTopicWorkspace
              selectedDirectoryClassroom={selectedDirectoryClassroom}
              selectedTopic={selectedTopic}
              reports={reports}
              materials={materials}
              students={students}
              activeTopicView={activeTopicView}
              setActiveTopicView={setActiveTopicView}
              updateTopicStatusMutation={updateTopicStatusMutation}
              materialTitle={materialTitle}
              setMaterialTitle={setMaterialTitle}
              materialDescription={materialDescription}
              setMaterialDescription={setMaterialDescription}
              materialFiles={materialFiles}
              setMaterialFiles={setMaterialFiles}
              materialUploadAttempts={materialUploadAttemptsQuery.data?.data ?? []}
              activationState={activationState}
              isActivationStateLoading={isActivationStateLoading}
              isActivationStateError={isActivationStateError}
              uploadMaterialMutation={uploadMaterialMutation}
              setIsInviteModalOpen={setIsInviteModalOpen}
            />
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
            availableCourses={initialData.availableCourses}
          />
        </>
      ) : null}
    </div>
  );
}
