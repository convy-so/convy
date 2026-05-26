"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type UIMessage } from "ai";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import { useStudentTutoringWorkspace } from "@/components/learning/hooks/use-student-tutoring-workspace";
import { QuizCard } from "@/components/learning/generative/quiz-card";
import { GradeCard } from "@/components/learning/generative/grade-card";
import { Link, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { LearningMeData } from "@/lib/api/learning";
import type {
  getStudentLearningWorkspaceInitialData,
} from "@/lib/server/app-queries";

type LiveMessage = UIMessage & {
  metadata: Record<string, unknown>;
  createdAt?: string | Date;
};

interface Props {
  classroomId: string;
  lessonId: string;
  learningMe: Extract<LearningMeData, { role: "student" }>;
  initialPatterns?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialPatterns"];
  initialTutoringSession?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialTutoringSession"];
}

function appendTranscript(currentValue: string, transcript: string) {
  const trimmedCurrent = currentValue.trim();
  return trimmedCurrent ? `${trimmedCurrent} ${transcript}`.trim() : transcript;
}

type ToolInvocationPayload = {
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
};

type ToolPartRecord = {
  toolInvocation?: ToolInvocationPayload;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  state?: string;
  result?: unknown;
};

export function LiveSessionClient({
  classroomId,
  lessonId,
  learningMe,
  initialPatterns,
  initialTutoringSession,
}: Props) {
  const router = useRouter();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [sessionInput, setSessionInput] = useState("");

  const {
    tutoringSessionQuery,
    tutoringChatMessages,
    sendTutoringChatMessage,
    addTutoringToolResult,
    completeTutoringMutation,
    selectedLesson,
    selectedMembership,
    sessionState,
    tutoringInitializationState,
    canUseTutoringChat,
  } = useStudentTutoringWorkspace({
    classroomId,
    lessonId,
    learningMe,
    initialPatterns,
    initialTutoringSession,
  });

  const {
    isSupported: isVoiceInputSupported,
    activeTarget: transcriptionTarget,
    startTranscription,
  } = useAudioTranscription({
    onError: (message) => toast.error(message),
  });

  const liveMessages = useMemo<LiveMessage[]>(
    () =>
      tutoringChatMessages.map((message) => {
        const hasAnnotations = (
          msg: unknown,
        ): msg is { annotations: Array<{ type: string; data?: Record<string, unknown> }> } => {
          return typeof msg === "object" && msg !== null && "annotations" in msg;
        };
        const metadataAnnotation = hasAnnotations(message)
          ? message.annotations?.find((ann) => ann.type === "metadata")
          : undefined;

        return {
          ...message,
          metadata: metadataAnnotation?.data ?? {},
        } as LiveMessage;
      }),
    [tutoringChatMessages],
  );

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [liveMessages]);

  const handleEndSession = () => {
    if (
      confirm(
        "Are you sure you want to finish this tutoring session? Your teacher report will be prepared based on your progress so far.",
      )
    ) {
      completeTutoringMutation.mutate(undefined, {
        onSuccess: () => {
          router.replace(`/student/classes/${classroomId}/progress`);
        },
      });
    }
  };

  const sessionFocus = sessionState?.knowledgeFocus?.slice(0, 4) ?? [];
  const showEmptyReadyState =
    tutoringInitializationState.status === "ready" && liveMessages.length === 0;
  const composerDisabled =
    !canUseTutoringChat || completeTutoringMutation.isPending;
  const addTutoringToolResultInput = addTutoringToolResult as (
    input: {
      toolCallId: string;
      result: Record<string, unknown>;
      output: Record<string, unknown>;
    },
  ) => void;
  const sendTutoringMessageWithAttachments = sendTutoringChatMessage as (
    input: {
      text: string;
      experimental_attachments: unknown;
      attachments: unknown;
    },
  ) => void;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fcfcfb_0%,#f6f6f3_100%)] pb-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={`/student/classes/${classroomId}/lessons`}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sessions
          </Link>

          {selectedLesson && tutoringSessionQuery.data?.data.sessionId ? (
            <button
              onClick={handleEndSession}
              disabled={completeTutoringMutation.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
            >
              {completeTutoringMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              End session
            </button>
          ) : null}
        </div>

        <section className="rounded-[28px] border border-[#e7e5df] bg-white px-5 py-6 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.24)] md:px-7">
          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                <Sparkles className="h-3.5 w-3.5" />
                Tutoring session
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  {selectedLesson?.title ?? "Lesson tutoring session"}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                  {selectedLesson?.description ??
                    "Ask questions, work through confusion, and let the tutor guide this lesson from here."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              {selectedMembership ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  {selectedMembership.classroom.title}
                </span>
              ) : null}
              {sessionFocus.map((concept) => (
                <span
                  key={concept}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800"
                >
                  {concept}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[30px] border border-[#e7e5df] bg-white shadow-[0_24px_64px_-52px_rgba(15,23,42,0.3)]">
          <div
            ref={chatContainerRef}
            className="flex min-h-[58vh] flex-col gap-6 bg-[linear-gradient(180deg,#fffdf9_0%,#ffffff_100%)] px-5 py-6 md:px-7"
          >
            {tutoringInitializationState.status === "loading" ? (
              <SessionStatusCard
                icon={<Loader2 className="h-7 w-7 animate-spin text-amber-700" />}
                title={tutoringInitializationState.title}
                message={tutoringInitializationState.message}
              />
            ) : null}

            {tutoringInitializationState.status === "blocked" ? (
              <SessionStatusCard
                icon={<AlertCircle className="h-7 w-7 text-amber-700" />}
                title={tutoringInitializationState.title}
                message={tutoringInitializationState.message}
                action={
                  tutoringInitializationState.ctaHref &&
                  tutoringInitializationState.ctaLabel ? (
                    <Link
                      href={tutoringInitializationState.ctaHref}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                      {tutoringInitializationState.ctaLabel}
                    </Link>
                  ) : null
                }
              />
            ) : null}

            {tutoringInitializationState.status === "error" ? (
              <SessionStatusCard
                icon={<AlertCircle className="h-7 w-7 text-rose-700" />}
                title={tutoringInitializationState.title}
                message={tutoringInitializationState.message}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      void tutoringSessionQuery.refetch();
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                }
              />
            ) : null}

            {showEmptyReadyState ? (
              <SessionStatusCard
                icon={<MessageSquare className="h-7 w-7 text-emerald-700" />}
                title="Your tutor is ready"
                message="Start with what feels unclear, what you want to practice, or the exact question you need help with."
              />
            ) : null}

            {tutoringInitializationState.status === "ready"
              ? liveMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex items-start gap-3",
                      message.role === "assistant" ? "justify-start" : "justify-end",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                        <Sparkles className="h-4.5 w-4.5" />
                      </div>
                    ) : null}

                    <div className="flex max-w-[84%] flex-col gap-3">
                      {message.parts?.map((part, index) => {
                        if (part.type === "text" && part.text.trim().length > 0) {
                          return (
                            <div
                              key={index}
                              className={cn(
                                "w-fit rounded-[22px] px-5 py-4 text-sm leading-7",
                                message.role === "assistant"
                                  ? "rounded-tl-md border border-slate-200 bg-slate-50 text-slate-800"
                                  : "ml-auto rounded-tr-md bg-slate-900 text-white",
                              )}
                            >
                              {part.text}
                            </div>
                          );
                        }

                        const toolPart = part as unknown as ToolPartRecord;
                        const isToolCall =
                          part.type === "tool-invocation" ||
                          part.type === "dynamic-tool" ||
                          part.type.startsWith("tool-");

                        if (!isToolCall) {
                          return null;
                        }

                        const toolName =
                          part.type === "tool-invocation"
                            ? toolPart.toolInvocation?.toolName
                            : toolPart.toolName;
                        const toolCallId =
                          part.type === "tool-invocation"
                            ? toolPart.toolInvocation?.toolCallId
                            : toolPart.toolCallId;
                        const args = (part.type === "tool-invocation"
                          ? toolPart.toolInvocation?.args
                          : toolPart.input || toolPart.args) as
                          | Record<string, unknown>
                          | undefined;
                        const isResolved =
                          part.type === "tool-invocation"
                            ? toolPart.toolInvocation !== undefined &&
                              "result" in toolPart.toolInvocation
                            : toolPart.state === "output-available" ||
                              toolPart.result !== undefined;
                        const resolvedToolCallId =
                          typeof toolCallId === "string" ? toolCallId : "tool-call";

                        if (toolName === "administer_quiz") {
                          if (isResolved) return null;

                          return (
                            <div key={index} className="w-full min-w-[300px]">
                              <QuizCard
                                quizId={
                                  typeof args?.quizId === "string"
                                    ? args.quizId
                                    : resolvedToolCallId
                                }
                                conceptKey={
                                  typeof args?.conceptKey === "string"
                                    ? args.conceptKey
                                    : ""
                                }
                                questionText={
                                  typeof args?.questionText === "string"
                                    ? args.questionText
                                    : ""
                                }
                                acceptsImageUpload={args?.acceptsImageUpload === true}
                                onSubmit={({ answerText, attachments }) => {
                                  addTutoringToolResultInput({
                                    toolCallId: resolvedToolCallId,
                                    result: {
                                      answerText,
                                      hasAttachments: !!attachments,
                                    },
                                    output: {
                                      answerText,
                                      hasAttachments: !!attachments,
                                    },
                                  });
                                  if (attachments) {
                                    sendTutoringMessageWithAttachments({
                                      text: answerText,
                                      experimental_attachments: attachments,
                                      attachments,
                                    });
                                  } else {
                                    sendTutoringChatMessage({ text: answerText });
                                  }
                                }}
                              />
                            </div>
                          );
                        }

                        if (toolName === "grade_student_work") {
                          if (isResolved) return null;

                          return (
                            <div key={index} className="w-full min-w-[300px]">
                              <GradeCard
                                score={
                                  args?.score !== undefined && typeof args.score === "number"
                                    ? args.score
                                    : Number(args?.score ?? 0)
                                }
                                feedback={String(args?.feedback ?? "")}
                                masteryLevel={
                                  args?.masteryLevel === "applied" ||
                                  args?.masteryLevel === "generative"
                                    ? args.masteryLevel
                                    : "surface"
                                }
                              />
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>
                ))
              : null}
          </div>

          <div className="border-t border-[#ece9e1] bg-[#fcfbf8] px-5 py-5 md:px-7">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!sessionInput.trim() || !canUseTutoringChat) return;
                sendTutoringChatMessage({ text: sessionInput.trim() });
                setSessionInput("");
              }}
            >
              <div className="flex items-end gap-3">
                <div className="relative flex-1">
                  <textarea
                    value={sessionInput}
                    onChange={(event) => setSessionInput(event.target.value)}
                    placeholder="Ask the tutor what you want to understand, practise, or challenge."
                    disabled={composerDisabled}
                    rows={3}
                    className="min-h-[112px] w-full resize-none rounded-[22px] border border-slate-200 bg-white px-5 py-4 pr-14 text-sm leading-7 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  {isVoiceInputSupported ? (
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
                      disabled={composerDisabled}
                      className={cn(
                        "absolute bottom-4 right-4 rounded-full p-2 transition-colors",
                        transcriptionTarget === "student-session"
                          ? "bg-rose-50 text-rose-600"
                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
                        composerDisabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Mic className="h-4.5 w-4.5" />
                    </button>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={composerDisabled || !sessionInput.trim()}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>

              <p className="text-sm text-slate-500">
                {canUseTutoringChat
                  ? "Use this space for the tutoring conversation only. Ask directly, show your reasoning, or request another explanation."
                  : tutoringInitializationState.message}
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function SessionStatusCard({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
        {icon}
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="max-w-md text-sm leading-7 text-slate-600">
          {message}
        </p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
