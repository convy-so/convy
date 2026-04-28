"use client";

import { useMemo, useState } from "react";
import { type UIMessage } from "ai";
import {
  ArrowRight,
  BookOpen,
  Brain,
  ClipboardList,
  Keyboard,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import {
  appLocaleLabels,
  appLocales,
  type AppLocale,
} from "@/lib/i18n/config";
import { GlassPanel } from "@/components/learning/glass-panel";
import { useStudentLearningWorkspace } from "@/components/learning/hooks/use-student-learning-workspace";
import { MetricTile } from "@/components/learning/metric-tile";
import { SectionHeading } from "@/components/learning/section-heading";
import type { LearningMeData } from "@/lib/api/learning";
type StudentLearningMeData = Extract<LearningMeData, { role: "student" }>;

type LiveMessage = {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt?: string | Date;
};

function getUIMessageText(message: UIMessage) {
  return (
    message.parts
      ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("") ?? ""
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getTutorMediaMetadata(metadata: Record<string, unknown>) {
  const tutorMedia = metadata.tutorMedia;
  if (!isRecord(tutorMedia)) return null;

  const assetType = tutorMedia.assetType;
  const title = tutorMedia.title;
  const mediaUrl = tutorMedia.mediaUrl;
  const reason = tutorMedia.reason;
  const expectedBenefit = tutorMedia.expectedBenefit;
  const followUpPrompt = tutorMedia.followUpPrompt;
  if (
    (assetType !== "image" && assetType !== "video") ||
    typeof title !== "string" ||
    typeof mediaUrl !== "string" ||
    typeof reason !== "string" ||
    typeof expectedBenefit !== "string" ||
    typeof followUpPrompt !== "string"
  ) {
    return null;
  }

  return {
    assetType,
    title,
    description:
      typeof tutorMedia.description === "string" ? tutorMedia.description : null,
    mediaUrl,
    thumbnailUrl:
      typeof tutorMedia.thumbnailUrl === "string"
        ? tutorMedia.thumbnailUrl
        : null,
    durationSeconds:
      typeof tutorMedia.durationSeconds === "number"
        ? tutorMedia.durationSeconds
        : null,
    selectionSource:
      typeof tutorMedia.selectionSource === "string"
        ? tutorMedia.selectionSource
        : "system",
    reason,
    expectedBenefit,
    followUpPrompt,
  };
}

function formatPhaseLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function appendTranscript(currentValue: string, transcript: string) {
  const trimmedCurrent = currentValue.trim();
  return trimmedCurrent ? `${trimmedCurrent} ${transcript}`.trim() : transcript;
}

export function StudentLearningHome({ learningMe }: { learningMe: StudentLearningMeData }) {
  const {
    memberships,
    selectedStudyLanguage,
    setSelectedStudyLanguage,
    setSelectedMembershipId,
    selectedMembership,
    availableSurveys,
    setSelectedTopicId,
    effectiveSelectedTopicId,
    onboardingQuery,
    patternsQuery,
    tutoringSessionQuery,
    onboardingChatMessages,
    sendOnboardingMessage,
    onboardingChatStatus,
    tutoringChatMessages,
    sendTutoringChatMessage,
    tutoringChatStatus,
    outOfSessionMutation,
    completeTutoringMutation,
    outOfSessionReply,
    setOutOfSessionReply,
    selectedTopic,
    currentStageId,
    completedPhaseCount,
    conceptCount,
    patterns,
    strongestPattern,
    membershipCount,
  } = useStudentLearningWorkspace({ learningMe });
  const [onboardingInput, setOnboardingInput] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const {
    isSupported: isVoiceInputSupported,
    activeTarget: transcriptionTarget,
    phase: transcriptionPhase,
    startTranscription,
    stopRecording: stopDictation,
  } = useAudioTranscription({
    onError: (message) => toast.error(message),
  });
  const isDictationSupported = isVoiceInputSupported;
  const isVoiceInputMode = inputMode === "voice";

  const liveMessages = useMemo<LiveMessage[]>(
    () =>
      tutoringChatMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: getUIMessageText(message),
        metadata: {},
      })),
    [tutoringChatMessages],
  );

  const onboardingMessages = useMemo(() => {
    if (!selectedMembership?.needsOnboarding) {
      return [];
    }

    return onboardingChatMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: getUIMessageText(message),
    }));
  }, [onboardingChatMessages, selectedMembership?.needsOnboarding]);

  if (!memberships.length) {
    return (
      <div className="mx-auto max-w-[1200px] px-2 pb-12">
        <GlassPanel className="px-6 py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            No classroom access yet
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
            Your teacher needs to invite you into a classroom before learning topics can appear here.
          </p>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),_transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Personalized Learning
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                Learn in a way that remembers how your mind works.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                Your teacher defines the topic and source material. The tutor then adapts explanations, examples, and pacing around the way you learn best.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Study language
                </span>
                <select
                  value={selectedStudyLanguage}
                  onChange={(event) =>
                    setSelectedStudyLanguage(event.target.value as AppLocale)
                  }
                  className="rounded-full border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-sky-400"
                >
                  {appLocales.map((language) => (
                    <option key={language} value={language}>
                      {appLocaleLabels[language]}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-6 text-slate-500">
                  Replies follow this language while the tutor stays grounded in the teacher&apos;s source material.
                </p>
              </div>
            </div>
          </div>

          <GlassPanel className="grid gap-4 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Your snapshot
            </div>
            <div className="flex justify-end">
              <Link
                href="/dashboard/learning/profile"
                className="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-200 hover:bg-white"
              >
                Open my profile
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTile
                label="Classrooms"
                value={String(membershipCount)}
                helper="Teacher spaces you currently belong to."
              />
              <MetricTile
                label="Topics"
                value={String(selectedMembership?.topics.length ?? 0)}
                helper="Available topics in the selected classroom."
              />
              <MetricTile
                label="Patterns"
                value={String(patterns.length)}
                helper="Learning overlays currently shaping your sessions."
              />
              <MetricTile
                label="Phase"
                value={currentStageId ? formatPhaseLabel(currentStageId) : "Ready"}
                helper="Your current place in the active session flow."
              />
            </div>
          </GlassPanel>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Input mode
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                  Choose how you reply
                </div>
              </div>
              <div className="inline-flex rounded-full border border-white/70 bg-white/85 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    stopDictation();
                    setInputMode("text");
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition ${
                    inputMode === "text"
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("voice")}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition ${
                    inputMode === "voice"
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Mic className="h-3.5 w-3.5" />
                  Voice
                </button>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Voice mode lets you speak your reply and review it before sending.
              Text mode keeps the keyboard-first experience.
            </p>
            {isVoiceInputMode && !isDictationSupported ? (
              <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
                Voice dictation is not supported in this browser, so text input will remain available.
              </div>
            ) : null}
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Your classes
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              Choose where to learn
            </div>
            <div className="mt-4 space-y-3">
              {memberships.map((membership) => {
                const isActive =
                  membership.classroomStudentId ===
                  (selectedMembership?.classroomStudentId ?? null);

                return (
                  <button
                    key={membership.classroomStudentId}
                    type="button"
                    onClick={() => {
                      setSelectedMembershipId(membership.classroomStudentId);
                      setSelectedTopicId(membership.topics[0]?.id ?? null);
                      setOutOfSessionReply(null);
                    }}
                    className={`w-full rounded-[18px] border px-4 py-4 text-left transition duration-300 ${
                      isActive
                        ? "border-sky-300 bg-sky-50/80"
                        : "border-white/70 bg-white/75 hover:border-slate-200 hover:bg-white"
                    }`}
                  >
                    <div className="text-base font-semibold text-slate-950">
                      {membership.classroom.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {membership.classroom.gradeLabel} · {membership.classroom.gradeBand}
                    </div>
                  </button>
                );
              })}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Topics
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              Continue a topic
            </div>
            <div className="mt-4 space-y-3">
              {selectedMembership?.topics.length ? (
                selectedMembership.topics.map((topic) => {
                  const isActive = topic.id === effectiveSelectedTopicId;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        setOutOfSessionReply(null);
                      }}
                      className={`w-full rounded-[18px] border px-4 py-4 text-left transition duration-300 ${
                        isActive
                          ? "border-emerald-300 bg-emerald-50/80"
                          : "border-white/70 bg-white/75 hover:border-slate-200 hover:bg-white"
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-950">
                        {topic.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {topic.subjectLabel ?? topic.subject ?? "General"} · {topic.status}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-sm text-slate-500">
                  No active topics yet in this classroom.
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="flex items-center gap-2 text-slate-950">
              <ClipboardList className="h-4 w-4 text-sky-700" />
              <h3 className="text-lg font-semibold tracking-tight">
                Assigned surveys
              </h3>
            </div>
            <div className="mt-4 space-y-3">
              {availableSurveys.length ? (
                availableSurveys.map((survey) => (
                  <div
                    key={survey.id}
                    className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          {survey.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Automatically assigned by your teacher
                          {survey.createdAt ? ` · ${formatDate(survey.createdAt)}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {survey.responseStatus.replace("_", " ")}
                        </div>
                        {survey.completedAt ? (
                          <div className="mt-2 text-[11px] text-slate-500">
                            Completed {formatDate(survey.completedAt)}
                          </div>
                        ) : null}
                      </div>
                      <Link
                        href={`/s/${survey.shareableLink}/respond`}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {survey.responseStatus === "completed"
                          ? "Review survey"
                          : survey.responseStatus === "in_progress"
                            ? "Resume survey"
                            : "Open survey"}
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-sm text-slate-500">
                  No surveys assigned to this classroom right now.
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="flex items-center gap-2 text-slate-950">
              <Brain className="h-4 w-4 text-violet-700" />
              <h3 className="text-lg font-semibold tracking-tight">
                How you learn best
              </h3>
            </div>
            <div className="mt-4 space-y-3">
              {patternsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading your pattern summaries...
                </div>
              ) : strongestPattern ? (
                patterns.map((pattern) => (
                  <div
                    key={`${pattern.scopeType}-${pattern.subjectKey ?? "global"}`}
                    className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">
                        {pattern.scopeType === "global"
                          ? "Across subjects"
                          : pattern.subjectLabel ?? pattern.subjectKey ?? "This subject"}
                      </div>
                      <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                        {pattern.confidenceLabel}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {pattern.studentSummary}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-sm text-slate-500">
                  Your learning summary will appear once onboarding and your first sessions generate enough evidence.
                </div>
              )}
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          {selectedMembership?.needsOnboarding ? (
            <GlassPanel className="p-6">
              <SectionHeading
                eyebrow="Before the first lesson"
                title="Let the tutor get to know you"
                description="This conversation shapes how the first session is taught. It is about you, not about getting graded."
              />

              <div className="mt-6 space-y-4">
                <div className="space-y-3 rounded-[24px] border border-white/70 bg-white/70 p-5">
                  {onboardingQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading onboarding conversation...
                    </div>
                  ) : onboardingMessages.length ? (
                    onboardingMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
                          message.role === "assistant"
                            ? "bg-slate-950 text-white"
                            : "ml-auto bg-sky-50 text-slate-800"
                        }`}
                      >
                        {message.content}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">
                      The onboarding conversation will appear here.
                    </div>
                  )}
                </div>

                <form
                  className="flex flex-col gap-3 md:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!onboardingInput.trim()) return;

                    sendOnboardingMessage({
                      text: onboardingInput.trim(),
                    });
                    setOnboardingInput("");
                  }}
                >
                  <div className="flex-1 space-y-2">
                    {isVoiceInputMode && isVoiceInputSupported ? (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            startTranscription({
                              target: "student-onboarding",
                              language: "multi",
                              onTranscript: (transcript) =>
                                setOnboardingInput((current) =>
                                  appendTranscript(current, transcript),
                                ),
                            })
                          }
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            transcriptionTarget === "student-onboarding"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                          }`}
                        >
                          {transcriptionTarget === "student-onboarding" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Mic className="h-3.5 w-3.5" />
                          )}
                          {transcriptionTarget === "student-onboarding"
                            ? transcriptionPhase === "recording"
                              ? "Listening..."
                              : "Transcribing..."
                            : "Tap to speak"}
                        </button>
                      </div>
                    ) : null}
                    <textarea
                      value={onboardingInput}
                      onChange={(event) => setOnboardingInput(event.target.value)}
                      rows={3}
                      placeholder="Reply naturally. The tutor is trying to understand how you learn and what matters to you."
                      className="min-h-[96px] w-full resize-none rounded-[20px] border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={onboardingChatStatus !== "ready" || !onboardingInput.trim()}
                    className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-[20px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {onboardingChatStatus !== "ready" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Continue
                  </button>
                </form>
              </div>
            </GlassPanel>
          ) : (
            <>
              <GlassPanel className="p-6">
                <SectionHeading
                  eyebrow="Active session"
                  title={selectedTopic?.title ?? "Choose a topic"}
                  description={
                    selectedTopic
                      ? "The tutor follows a structured session plan, but adapts examples and explanations around how you learn best."
                      : "Pick a topic from the left to continue learning."
                  }
                  action={
                    <div className="flex items-center gap-2">
                      {currentStageId ? (
                        <div className="rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600">
                          {formatPhaseLabel(currentStageId)}
                        </div>
                      ) : null}
                      {selectedTopic && tutoringSessionQuery.data?.data.sessionId ? (
                        <button
                          type="button"
                          onClick={() =>
                            completeTutoringMutation.mutate(undefined, {
                              onSuccess: () => {
                                setSessionInput("");
                              },
                            })
                          }
                          disabled={completeTutoringMutation.isPending || tutoringChatStatus !== "ready"}
                          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {completeTutoringMutation.isPending ? "Finishing..." : "Finish session"}
                        </button>
                      ) : null}
                    </div>
                  }
                />

                {selectedTopic ? (
                  <div className="mt-6 space-y-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <MetricTile
                        label="Phases"
                        value={`${completedPhaseCount}`}
                        helper="Completed framework stages in this session so far."
                      />
                      <MetricTile
                        label="Concepts"
                        value={String(conceptCount)}
                        helper="Concepts the session is currently designed to cover."
                      />
                      <MetricTile
                        label="Updated"
                        value={formatDate(tutoringSessionQuery.data?.data.messages.at(-1)?.createdAt)}
                        helper="Latest visible moment in this conversation."
                      />
                    </div>

                    <div className="space-y-3 rounded-[24px] border border-white/70 bg-white/70 p-5">
                      {tutoringSessionQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading your tutoring session...
                        </div>
                      ) : liveMessages.length ? (
                        liveMessages.map((message) => (
                          <div key={message.id} className="space-y-3">
                            <div
                              className={`max-w-[88%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
                                message.role === "assistant"
                                  ? "bg-slate-950 text-white"
                                  : "ml-auto bg-sky-50 text-slate-800"
                              }`}
                            >
                              {message.content}
                            </div>
                            {message.role === "assistant" && (() => {
                              const tutorMedia = getTutorMediaMetadata(message.metadata);
                              if (!tutorMedia) return null;

                              return (
                                <div className="max-w-[88%] rounded-[22px] border border-sky-100 bg-sky-50/70 p-4 text-slate-800 shadow-sm">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                                    Tutor visual aid
                                  </div>
                                  <div className="mt-2 text-sm font-semibold text-slate-950">
                                    {tutorMedia.title}
                                  </div>
                                  {tutorMedia.description ? (
                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                      {tutorMedia.description}
                                    </p>
                                  ) : null}
                                  <div className="mt-4 overflow-hidden rounded-[18px] border border-white/80 bg-white">
                                    {tutorMedia.assetType === "image" ? (
                                      // eslint-disable-next-line @next/next/no-img-element -- tutor media URLs are runtime content and are not currently modeled for next/image optimization
                                      <img
                                        src={tutorMedia.mediaUrl}
                                        alt={tutorMedia.title}
                                        className="max-h-72 w-full object-cover"
                                      />
                                    ) : (
                                      <video
                                        controls
                                        className="max-h-72 w-full bg-slate-950"
                                        poster={tutorMedia.thumbnailUrl ?? undefined}
                                      >
                                        <source src={tutorMedia.mediaUrl} />
                                      </video>
                                    )}
                                  </div>
                                  <div className="mt-3 space-y-1 text-xs leading-5 text-slate-600">
                                    <p><span className="font-semibold text-slate-800">Why now:</span> {tutorMedia.reason}</p>
                                    <p><span className="font-semibold text-slate-800">Benefit:</span> {tutorMedia.expectedBenefit}</p>
                                    <p><span className="font-semibold text-slate-800">Follow-up:</span> {tutorMedia.followUpPrompt}</p>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500">
                          The session conversation will appear here.
                        </div>
                      )}
                    </div>

                    <form
                      className="flex flex-col gap-3 md:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!effectiveSelectedTopicId || !sessionInput.trim()) return;

                        sendTutoringChatMessage({
                          text: sessionInput.trim(),
                        });
                        setSessionInput("");
                      }}
                    >
                      <div className="flex-1 space-y-2">
                        {isVoiceInputMode && isVoiceInputSupported ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                startTranscription({
                                  target: "student-session",
                                  language: "multi",
                                  onTranscript: (transcript) =>
                                    setSessionInput((current) =>
                                      appendTranscript(current, transcript),
                                    ),
                                })
                              }
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                transcriptionTarget === "student-session"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                              }`}
                            >
                              {transcriptionTarget === "student-session" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Mic className="h-3.5 w-3.5" />
                              )}
                              {transcriptionTarget === "student-session"
                                ? transcriptionPhase === "recording"
                                  ? "Listening..."
                                  : "Transcribing..."
                                : "Tap to speak"}
                            </button>
                          </div>
                        ) : null}
                        <textarea
                          value={sessionInput}
                          onChange={(event) => setSessionInput(event.target.value)}
                          rows={3}
                          placeholder="Ask a question, answer the tutor, or explain the concept in your own words."
                          className="min-h-[96px] w-full resize-none rounded-[20px] border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-emerald-300"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={tutoringChatStatus !== "ready" || !sessionInput.trim()}
                        className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-[20px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        {tutoringChatStatus !== "ready" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="mt-6 rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-sm leading-7 text-slate-500">
                    This classroom does not have an active topic available yet.
                  </div>
                )}
              </GlassPanel>

              <GlassPanel className="p-6">
                <SectionHeading
                  eyebrow="Between sessions"
                  title="Ask a quick question"
                  description="Use this when you want help after class without stepping back into the main session flow."
                />

                <form
                  className="mt-6 flex flex-col gap-3 md:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!effectiveSelectedTopicId || !questionInput.trim()) return;

                    outOfSessionMutation.mutate(
                      {
                        topicId: effectiveSelectedTopicId,
                        message: questionInput.trim(),
                        language: selectedStudyLanguage,
                      },
                      {
                        onSuccess: () => {
                          setQuestionInput("");
                        },
                      },
                    );
                  }}
                >
                  <div className="flex-1 space-y-2">
                    {isVoiceInputMode && isVoiceInputSupported ? (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            startTranscription({
                              target: "student-question",
                              language: "multi",
                              onTranscript: (transcript) =>
                                setQuestionInput((current) =>
                                  appendTranscript(current, transcript),
                                ),
                            })
                          }
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            transcriptionTarget === "student-question"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                          }`}
                        >
                          {transcriptionTarget === "student-question" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Mic className="h-3.5 w-3.5" />
                          )}
                          {transcriptionTarget === "student-question"
                            ? transcriptionPhase === "recording"
                              ? "Listening..."
                              : "Transcribing..."
                            : "Tap to speak"}
                        </button>
                      </div>
                    ) : null}
                    <textarea
                      value={questionInput}
                      onChange={(event) => setQuestionInput(event.target.value)}
                      rows={3}
                      placeholder="Ask something related to this topic and the tutor will answer without changing your active session."
                      className="min-h-[96px] w-full resize-none rounded-[20px] border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-violet-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={outOfSessionMutation.isPending || !questionInput.trim()}
                    className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {outOfSessionMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    Ask question
                  </button>
                </form>

                {outOfSessionReply ? (
                  <div className="mt-5 rounded-[20px] border border-violet-100 bg-violet-50/80 px-5 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                      <BookOpen className="h-4 w-4" />
                      Tutor reply
                    </div>
                    <p className="mt-2 text-sm leading-6 text-violet-950">
                      {outOfSessionReply}
                    </p>
                  </div>
                ) : null}
              </GlassPanel>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
