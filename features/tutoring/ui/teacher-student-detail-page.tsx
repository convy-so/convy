"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Layout,
  MessageSquare,
} from "lucide-react";

import { Link } from "@/i18n/routing";
import { TeacherStudentChat } from "@/features/tutoring/ui/teacher-student-chat";
import { getSubjectDisplayLabel } from "@/features/tutoring/server/subject-packages";
import type {
  getClassroomStudentOverviewData,
  getClassroomStudentPatternData,
} from "@/shared/http/page-data";

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

type StudentDetailView =
  | "overview"
  | "patterns"
  | "reports"
  | "interactions"
  | "copilot";

type PatternSubview = "summaries" | "misconceptions";

export function TeacherStudentDetailPage({
  initialOverview,
  initialPatterns,
}: {
  initialOverview: Awaited<ReturnType<typeof getClassroomStudentOverviewData>>;
  initialPatterns: Awaited<ReturnType<typeof getClassroomStudentPatternData>>;
}) {
  const [activeView, setActiveView] = useState<StudentDetailView>("overview");
  const [activePatternSubview, setActivePatternSubview] =
    useState<PatternSubview>("summaries");
  const [selectedConversationSessionId, setSelectedConversationSessionId] =
    useState<string | null>(null);
  const { student, recentReports, tutoringSessions, conversationTurns, navigation } =
    initialOverview.data;
  const patterns = useMemo(
    () => initialPatterns.data.profiles ?? [],
    [initialPatterns.data.profiles],
  );
  const memoryState = initialPatterns.data.memoryState;
  const selectedConversationSession =
    tutoringSessions.find((session) => session.id === selectedConversationSessionId) ??
    tutoringSessions[0] ??
    null;
  const selectedSessionConversationTurns = useMemo(
    () =>
      selectedConversationSession
        ? conversationTurns.filter(
            (interaction) => interaction.sessionId === selectedConversationSession.id,
          )
        : [],
    [conversationTurns, selectedConversationSession],
  );

  const persistentMisconceptions = useMemo(
    () =>
      Array.from(
        new Map(
          patterns
            .flatMap((pattern) => pattern.persistentMisconceptions)
            .filter(
              (
                misconception,
              ): misconception is {
                key: string;
                label: string;
                description: string;
                lastSeenAt: string;
              } => Boolean(misconception),
            )
            .map((misconception) => [misconception.key, misconception]),
        ).values(),
      )
        .filter(
          (
            misconception,
          ): misconception is {
            key: string;
            label: string;
            description: string;
            lastSeenAt: string;
          } => Boolean(misconception),
        )
        .slice(0, 8),
    [patterns],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <ChevronDown className="h-4 w-4 rotate-90" />
        </div>
        Back
      </button>

      <section className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {student.fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{student.classroom.title}</span>
              <span>&bull;</span>
              <span>{student.classroom.gradeLabel}</span>
              <span>&bull;</span>
              <span>{student.email}</span>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Review this learner one layer at a time instead of mixing reports,
              patterns, interactions, sessions, and support context into one dense
              screen.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="text-sm text-slate-500">
              Student {navigation.position} of {navigation.totalStudents}
            </div>
            <div className="flex items-center gap-2">
              {navigation.previousStudent ? (
                <Link
                  href={`/dashboard/learning/students/${navigation.previousStudent.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Link>
              ) : null}
              {navigation.nextStudent ? (
                <Link
                  href={`/dashboard/learning/students/${navigation.nextStudent.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  Next student
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveView("overview")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeView === "overview"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Layout className="h-4 w-4" />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveView("patterns")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeView === "patterns"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Brain className="h-4 w-4" />
            Patterns
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {patterns.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("reports")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeView === "reports"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <GraduationCap className="h-4 w-4" />
            Reports
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {recentReports.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("interactions")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeView === "interactions"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Conversations
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {tutoringSessions.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("copilot")}
            className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeView === "copilot"
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Brain className="h-4 w-4" />
            Copilot
          </button>
        </nav>
      </div>

      {activeView === "overview" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Student details
              </h2>
            </div>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Email
                </div>
                <div className="mt-2 text-sm text-slate-700">{student.email}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Classroom
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {student.classroom.title}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Invite status
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {formatStatusLabel(student.inviteStatus)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Onboarding
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {formatStatusLabel(student.onboardingStatus)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Profile updated
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {formatDate(student.profileLastUpdated)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Grade
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {student.classroom.gradeLabel}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeView === "patterns" ? (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Patterns
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                This area separates current long-horizon learning memory summaries from
                recurring misconception signals so each surface carries one kind of
                meaning.
              </p>
            </div>

            <div className="border-b border-slate-200">
              <nav className="-mb-px flex flex-wrap items-center gap-6">
                <button
                  type="button"
                  onClick={() => setActivePatternSubview("summaries")}
                  className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    activePatternSubview === "summaries"
                      ? "border-slate-950 text-slate-950"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  <Brain className="h-4 w-4" />
                  Learning patterns
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {patterns.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePatternSubview("misconceptions")}
                  className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    activePatternSubview === "misconceptions"
                      ? "border-slate-950 text-slate-950"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  Persistent misconceptions
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {persistentMisconceptions.length}
                  </span>
                </button>
              </nav>
            </div>
          </section>

          {activePatternSubview === "summaries" ? (
            <section className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                  Learning patterns
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  The tutor&apos;s current interpretation of how this learner tends to
                  understand, respond, and progress.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {memoryState.status !== "ready" && memoryState.message ? (
                  <div className="px-6 py-4 text-sm text-amber-900">
                    {memoryState.message}
                  </div>
                ) : null}
                {patterns.length ? (
                  patterns.map((pattern) => (
                    <div
                      key={`${pattern.scopeType}-${pattern.subjectKey ?? "global"}`}
                      className="space-y-4 px-6 py-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-slate-950">
                            {pattern.scopeType === "global"
                              ? "Global pattern"
                              : pattern.subjectKey
                                ? getSubjectDisplayLabel(pattern.subjectKey)
                                : "Subject pattern"}
                          </div>
                          <div className="text-sm text-slate-500">
                            Confidence: {pattern.confidenceLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-500">
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                            {Math.round((pattern.patternConfidence ?? 0) * 100)}%
                          </span>
                          <span>Updated {formatDate(pattern.updatedAt)}</span>
                        </div>
                      </div>
                      <p className="max-w-4xl text-sm leading-6 text-slate-600">
                        {pattern.teacherSummary ?? pattern.studentSummary}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-10 text-sm text-slate-500">
                    No pattern profile is available yet.
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {activePatternSubview === "misconceptions" ? (
            <section className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                  Persistent misconceptions
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Misunderstandings that recur often enough to be treated as stable
                  teaching concerns rather than one-off mistakes.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {persistentMisconceptions.length ? (
                  persistentMisconceptions.map((misconception) => (
                    <div
                      key={`${misconception.key}-${misconception.lastSeenAt}`}
                      className="space-y-2 px-6 py-5"
                    >
                      <div className="text-base font-semibold text-slate-950">
                        {misconception.label}
                      </div>
                      <p className="max-w-4xl text-sm leading-6 text-slate-600">
                        {misconception.description}
                      </p>
                      <div className="text-sm text-slate-500">
                        Last seen {formatDate(misconception.lastSeenAt)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-10 text-sm text-slate-500">
                    No persistent misconceptions are being surfaced yet.
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeView === "reports" ? (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Recent reports
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Tutoring outcomes and the strongest takeaways for this learner.
            </p>
          </div>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_130px_140px_44px] gap-4 border-b border-slate-100 px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-400 md:grid">
            <div>Topic and summary</div>
            <div>Mastery</div>
            <div>Updated</div>
            <div>Gap focus</div>
            <div />
          </div>
          <div className="divide-y divide-slate-100">
            {recentReports.length ? (
              recentReports.map((report) => {
                const identifiedGaps = report.report.identifiedGaps ?? [];

                return (
                  <Link
                    key={report.id}
                    href={`/dashboard/learning/students/${student.id}/reports/${report.id}`}
                    className="block px-6 py-5 transition hover:bg-slate-50"
                  >
                    <div className="space-y-4 md:hidden">
                      <div>
                        <div className="text-base font-semibold text-slate-950">
                          {report.topicTitle}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {formatDate(report.updatedAt)}
                        </div>
                      </div>
                      <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {report.masteryPercent}% mastery
                      </div>
                      <p className="text-sm leading-6 text-slate-600">
                        {report.report.studentSummary}
                      </p>
                      <div className="text-sm text-slate-500">
                        {identifiedGaps[0] ?? "No gap highlighted"}
                      </div>
                    </div>

                    <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_130px_140px_44px] items-start gap-4 md:grid">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">
                          {report.topicTitle}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                          {report.report.studentSummary}
                        </p>
                      </div>
                      <div className="pt-0.5">
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {report.masteryPercent}%
                        </span>
                      </div>
                      <div className="pt-1 text-sm text-slate-500">
                        {formatDate(report.updatedAt)}
                      </div>
                      <div className="pt-1 text-sm text-slate-500">
                        {identifiedGaps[0] ?? "None"}
                      </div>
                      <div className="flex justify-end pt-0.5 text-slate-400">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="px-6 py-10 text-sm text-slate-500">
                No reports yet for this student.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeView === "interactions" ? (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Session conversations
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Choose one tutoring session to review only that conversation for this
              classroom student.
            </p>
          </div>
          {tutoringSessions.length ? (
            <div className="grid min-h-[520px] lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="border-b border-slate-100 lg:border-b-0 lg:border-r">
                <div className="px-6 py-4 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Sessions
                </div>
                <div className="divide-y divide-slate-100">
                  {tutoringSessions.map((sessionRow) => {
                    const isSelected = selectedConversationSession?.id === sessionRow.id;

                    return (
                      <button
                        key={sessionRow.id}
                        type="button"
                        onClick={() => setSelectedConversationSessionId(sessionRow.id)}
                        className={`block w-full px-6 py-4 text-left transition ${
                          isSelected ? "bg-slate-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-950">
                          {sessionRow.topicTitle ?? "Tutoring session"}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {formatDate(sessionRow.createdAt)}
                        </div>
                        <div className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                          {formatStatusLabel(sessionRow.sessionStatus)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-w-0">
                {selectedConversationSession ? (
                  <>
                    <div className="border-b border-slate-100 px-6 py-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-lg font-semibold text-slate-950">
                            {selectedConversationSession.topicTitle ?? "Tutoring session"}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {formatDate(selectedConversationSession.createdAt)} &bull;{" "}
                            {formatStatusLabel(selectedConversationSession.sessionStatus)}
                          </div>
                        </div>
                        {selectedConversationSession.topicId ? (
                          <Link
                            href={`/dashboard/learning/sessions/${selectedConversationSession.topicId}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                          >
                            Open topic
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        ) : null}
                      </div>
                      {selectedConversationSession.summary ? (
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                          {selectedConversationSession.summary}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-4 px-6 py-5">
                      {selectedSessionConversationTurns.length ? (
                        selectedSessionConversationTurns.map((interaction) => {
                          const isTutor = interaction.role === "assistant";

                          return (
                            <div
                              key={interaction.id}
                              className={`flex ${isTutor ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                                  isTutor
                                    ? "bg-slate-950 text-white"
                                    : "border border-slate-200 bg-white text-slate-700"
                                }`}
                              >
                                <div
                                  className={`mb-2 text-xs font-medium uppercase tracking-[0.14em] ${
                                    isTutor ? "text-slate-300" : "text-slate-400"
                                  }`}
                                >
                                  {isTutor ? "Tutor" : "Student"}
                                </div>
                                <p>{interaction.content}</p>
                                <div
                                  className={`mt-3 text-xs ${
                                    isTutor ? "text-slate-300" : "text-slate-400"
                                  }`}
                                >
                                  {formatDate(interaction.createdAt)}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-10 text-sm text-slate-500">
                          No conversation turns were logged for this session.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">
              No tutoring sessions are available for this student yet.
            </div>
          )}
        </section>
      ) : null}

      {activeView === "copilot" ? (
        <TeacherStudentChat
          classroomStudentId={student.id}
          studentName={student.fullName}
        />
      ) : null}
    </div>
  );
}
