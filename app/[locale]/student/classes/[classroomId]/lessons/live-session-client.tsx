"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAudioTranscription } from "@/features/surveys/client/hooks/use-audio-transcription";
import {
  type TutoringOutgoingMessage,
  useStudentTutoringWorkspace,
} from "@/features/tutoring/client/hooks/use-student-tutoring-workspace";
import { QuizCard } from "@/features/tutoring/ui/generative/quiz-card";
import { GradeCard } from "@/features/tutoring/ui/generative/grade-card";
import { MarkdownMessage } from "@/shared/ui/markdown-message";
import { Link } from "@/i18n/routing";
import { cn } from "@/shared/ui/tailwind-class-utils";
import type { StudentMeData } from "@/features/tutoring/public-client";
import { STUDENT_MASTERY_LEVEL } from "@/shared/tutoring/constants";
import type {
  getStudentWorkspaceInitialData,
} from "@/shared/http/page-data";
import { logTutoringDebug, summarizeTutoringText } from "@/features/tutoring/public-server";
import {
  appendTranscript,
  getToolPayload,
  hasSuccessfulFinishSession,
  isToolPayloadRecord,
  MediaResultCard,
  normalizeLiveMessage,
  type LiveMessage,
} from "./live-session-message-parts";
import { LiveSessionStatusCard } from "./live-session-status-card";

interface Props {
  classroomId: string;
  lessonId: string;
  studentMe: Extract<StudentMeData, { role: "student" }>;
  initialPatterns?: Awaited<
    ReturnType<typeof getStudentWorkspaceInitialData>
  >["initialPatterns"];
  initialTutoringSession?: Awaited<
    ReturnType<typeof getStudentWorkspaceInitialData>
  >["initialTutoringSession"];
}

function getPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof payload[key] === "string" ? payload[key] : undefined;
}

function getPayloadBoolean(
  payload: Record<string, unknown>,
  key: string,
): boolean | undefined {
  return typeof payload[key] === "boolean" ? payload[key] : undefined;
}

function getPayloadNumber(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  return typeof payload[key] === "number" ? payload[key] : undefined;
}

function getMasteryLevel(
  payload: Record<string, unknown>,
): "surface" | "applied" | "generative" {
  const masteryLevel = getPayloadString(payload, "masteryLevel");
  if (
    masteryLevel === STUDENT_MASTERY_LEVEL.APPLIED ||
    masteryLevel === STUDENT_MASTERY_LEVEL.GENERATIVE
  ) {
    return masteryLevel;
  }

  return STUDENT_MASTERY_LEVEL.SURFACE;
}

export function LiveSessionClient({
  classroomId,
  lessonId,
  studentMe,
  initialPatterns,
  initialTutoringSession,
}: Props) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [sessionInput, setSessionInput] = useState("");
  const voiceBarTimings = [0.55, 0.8, 1, 0.65, 0.9, 0.5, 0.75, 0.4, 0.85, 0.6];

  const createUserTextMessage = (text: string): TutoringOutgoingMessage => ({
    role: "user",
    parts: [{ type: "text", text }],
  });

  const {
    tutoringSessionQuery,
    tutoringChatMessages,
    sendTutoringChatMessage,
    selectedLesson,
    sessionState,
    sessionCompleted,
    tutoringInitializationState,
    canUseTutoringChat,
    tutoringChatStatus,
  } = useStudentTutoringWorkspace({
    classroomId,
    lessonId,
    studentMe,
    initialPatterns,
    initialTutoringSession,
  });

  const {
    isSupported: isVoiceInputSupported,
    activeTarget: transcriptionTarget,
    phase: transcriptionPhase,
    startTranscription,
    stopRecording,
  } = useAudioTranscription({
    onError: (message) => toast.error(message),
  });

  const isRecording = transcriptionPhase === "recording" && transcriptionTarget === "student-session";
  const isTranscribing = transcriptionPhase === "transcribing" && transcriptionTarget === "student-session";

  const liveMessages = useMemo<LiveMessage[]>(
    () => tutoringChatMessages.map(normalizeLiveMessage),
    [tutoringChatMessages],
  );

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [liveMessages]);

  const sessionFocus = useMemo(() => {
    return (
      sessionState?.contentScopeSnapshot?.learningOutcomes
        ?.map((o) => o.title)
        .slice(0, 4) ?? []
    );
  }, [sessionState?.contentScopeSnapshot?.learningOutcomes]);
  const streamedCompletion = hasSuccessfulFinishSession(liveMessages);
  const sessionFinished = sessionCompleted || streamedCompletion;
  const showEmptyReadyState =
    tutoringInitializationState.status === "ready" &&
    liveMessages.length === 0 &&
    !sessionFinished;
  const composerDisabled = !canUseTutoringChat || sessionFinished;

  useEffect(() => {
    if (streamedCompletion && !sessionCompleted) {
      void tutoringSessionQuery.refetch();
    }
  }, [sessionCompleted, streamedCompletion, tutoringSessionQuery]);

  useEffect(() => {
    logTutoringDebug("client:live-session:state", {
      classroomId,
      lessonId,
      canUseTutoringChat,
      composerDisabled,
      chatStatus: tutoringChatStatus,
      messageCount: tutoringChatMessages.length,
      sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
      initialStatus: tutoringInitializationState.status,
    });
  }, [
    classroomId,
    canUseTutoringChat,
    composerDisabled,
    lessonId,
    tutoringChatMessages.length,
    tutoringChatStatus,
    tutoringInitializationState.status,
    tutoringSessionQuery.data?.data.sessionId,
  ]);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/student/classes/${classroomId}/lessons`}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to lessons</span>
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <h1 className="text-sm font-semibold text-slate-900 line-clamp-1">
              {selectedLesson?.title ?? "Lesson session"}
            </h1>
          </div>
          {sessionFocus.length > 0 && (
            <div className="hidden items-center gap-2 md:flex">
              <div className="mx-2 h-4 w-px bg-slate-200" />
              {sessionFocus.slice(0, 3).map((concept: string) => (
                <span
                  key={concept}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                >
                  {concept}
                </span>
              ))}
            </div>
          )}
        </div>

        {sessionFinished ? (
          <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">Completed</span>
          </div>
        ) : null}
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-4 py-8 md:px-8 lg:px-24"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-6">
            {tutoringInitializationState.status === "loading" ? (
              <LiveSessionStatusCard
                icon={<Loader2 className="h-6 w-6 animate-spin text-slate-400" />}
                title={tutoringInitializationState.title}
                message={tutoringInitializationState.message}
              />
            ) : null}

            {tutoringInitializationState.status === "blocked" ? (
              <LiveSessionStatusCard
                icon={<AlertCircle className="h-6 w-6 text-amber-500" />}
                title={tutoringInitializationState.title}
                message={tutoringInitializationState.message}
                action={
                  tutoringInitializationState.ctaHref &&
                  tutoringInitializationState.ctaLabel ? (
                    <Link
                      href={tutoringInitializationState.ctaHref}
                      className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      {tutoringInitializationState.ctaLabel}
                    </Link>
                  ) : null
                }
              />
            ) : null}

            {tutoringInitializationState.status === "error" ? (
              <LiveSessionStatusCard
                icon={<AlertCircle className="h-6 w-6 text-rose-500" />}
                title={tutoringInitializationState.title}
                message={tutoringInitializationState.message}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      void tutoringSessionQuery.refetch();
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                }
              />
            ) : null}

            {showEmptyReadyState ? (
              <LiveSessionStatusCard
                icon={<MessageSquare className="h-6 w-6 text-emerald-600" />}
                title="Your lesson is ready"
                message="Start with what feels unclear, what you want to practice, or the exact question you need help with."
              />
            ) : null}

            {sessionFinished ? (
              <LiveSessionStatusCard
                icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
                title="Lesson complete"
                message="Your teacher report is being prepared. You can review the transcript here or return to progress."
                action={
                  <Link
                    href={`/student/classes/${classroomId}/progress`}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                  >
                    View progress
                  </Link>
                }
              />
            ) : null}

            {tutoringInitializationState.status === "ready"
              ? liveMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex items-start gap-4",
                      message.role === "assistant" ? "justify-start" : "justify-end",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    ) : null}

                    <div className="flex max-w-[85%] flex-col gap-3 lg:max-w-[75%]">
                      {message.parts.map((part, index) => {
                        if (part.kind === "text" && part.text.trim().length > 0) {
                          return (
                            <div
                              key={index}
                              className={cn(
                                "w-fit px-5 py-3.5 text-[15px] leading-relaxed",
                                message.role === "assistant"
                                  ? "rounded-2xl rounded-tl-sm border border-slate-100 bg-white text-slate-800"
                                  : "ml-auto rounded-2xl rounded-tr-sm bg-slate-900 text-white",
                              )}
                              >
                              {message.role === "assistant" ? (
                                <MarkdownMessage content={part.text} />
                              ) : (
                                part.text
                              )}
                            </div>
                          );
                        }

                        if (part.kind !== "tool") {
                          return null;
                        }

                        const toolName = part.toolName;
                        const payload = getToolPayload(part.input, part.output);
                        const resolvedToolCallId = part.toolCallId ?? "tool-call";
                        const quizId = getPayloadString(payload, "quizId");
                        const conceptKey = getPayloadString(payload, "conceptKey");
                        const questionText = getPayloadString(payload, "questionText");
                        const acceptsImageUpload =
                          getPayloadBoolean(payload, "acceptsImageUpload") === true;

                        if (toolName === "administer_quiz") {
                          return (
                            <div key={index} className="w-full min-w-[300px]">
                              <QuizCard
                                quizId={quizId ?? resolvedToolCallId}
                                conceptKey={conceptKey ?? ""}
                                questionText={questionText ?? ""}
                                acceptsImageUpload={acceptsImageUpload}
                                disabled={sessionFinished}
                                onSubmit={({ answerText, attachments }) => {
                                  const answerMessage = [
                                    `Quiz answer`,
                                    `quizId: ${quizId ?? resolvedToolCallId}`,
                                    `conceptKey: ${conceptKey ?? ""}`,
                                    `question: ${questionText ?? ""}`,
                                    `answer: ${answerText}`,
                                  ].join("\n");
                                  if (attachments) {
                                    void sendTutoringChatMessage({
                                      text: answerMessage,
                                      files: attachments,
                                    });
                                  } else {
                                    void sendTutoringChatMessage(
                                      createUserTextMessage(answerMessage),
                                    );
                                  }
                                }}
                              />
                            </div>
                          );
                        }

                        if (toolName === "grade_student_work") {
                          if (!part.isResolved) return null;
                          if (
                            isToolPayloadRecord(part.output) &&
                            getPayloadBoolean(part.output, "success") === false
                          ) {
                            return null;
                          }

                          return (
                            <div key={index} className="w-full min-w-[300px]">
                              <GradeCard
                                conceptKey={conceptKey}
                                score={
                                  getPayloadNumber(payload, "score") ??
                                  Number(getPayloadString(payload, "score") ?? 0)
                                }
                                feedback={getPayloadString(payload, "feedback") ?? ""}
                                masteryLevel={getMasteryLevel(payload)}
                              />
                            </div>
                          );
                        }

                        if (toolName === "search_image" || toolName === "search_video") {
                          if (
                            !part.isResolved ||
                            !isToolPayloadRecord(part.output) ||
                            getPayloadBoolean(part.output, "success") !== true
                          ) {
                            return null;
                          }

                          return (
                            <MediaResultCard
                              key={index}
                              mediaType={toolName === "search_image" ? "image" : "video"}
                              result={part.output}
                            />
                          );
                        }

                        if (toolName === "finish_session") {
                          if (
                            !part.isResolved ||
                            !isToolPayloadRecord(part.output) ||
                            getPayloadBoolean(part.output, "success") !== true
                          ) {
                            return null;
                          }

                          return null;
                        }

                        return null;
                      })}
                    </div>
                  </div>
                ))
              : null}
            {tutoringChatStatus === "submitted" ? (
              <div className="flex items-start gap-4 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="w-fit px-5 py-3.5 rounded-2xl rounded-tl-sm border border-slate-100 bg-white text-slate-800 flex items-center gap-1.5 h-[52px]">
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]"></div>
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]"></div>
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"></div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 border-t px-4 py-4 transition-colors duration-300 md:px-8",
            isRecording
              ? "border-rose-200 bg-rose-50/40"
              : "border-slate-200 bg-slate-50/50",
          )}
        >
          <div className="mx-auto max-w-4xl">
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!sessionInput.trim() || !canUseTutoringChat) {
                  logTutoringDebug("client:live-session:submit-blocked", {
                    lessonId,
                    canUseTutoringChat,
                    hasInput: Boolean(sessionInput.trim()),
                    sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
                  });
                  return;
                }
                logTutoringDebug("client:live-session:submit", {
                  lessonId,
                  sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
                  text: summarizeTutoringText(sessionInput.trim(), 180),
                });
                void sendTutoringChatMessage(createUserTextMessage(sessionInput.trim()));
                setSessionInput("");
              }}
            >
              {/* Ã¢â€â‚¬Ã¢â€â‚¬ VOICE RECORDING STATE Ã¢â€â‚¬Ã¢â€â‚¬ */}
              {isRecording ? (
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-rose-200 bg-white px-6 py-5">
                  {/* mic + animated waveform */}
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500">
                      <Mic className="h-5 w-5 text-white" />
                      <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-30" />
                    </div>
                    {/* waveform bars */}
                    <div className="flex h-8 items-center gap-[3px]">
                      {voiceBarTimings.map((delay, i) => (
                        <div
                          key={i}
                          className="w-[3px] rounded-full bg-rose-400 origin-bottom"
                          style={{
                            height: "32px",
                            animation: `voice-bar ${0.6 + delay * 0.4}s ease-in-out ${i * 0.07}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-rose-600 tracking-wide">ListeningÃ¢â‚¬Â¦</span>
                  </div>

                  {/* live transcript preview */}
                  <div className="w-full min-h-[40px] text-center">
                    {sessionInput ? (
                      <p className="text-[15px] leading-relaxed text-slate-700">
                        {sessionInput}
                        <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-rose-400 align-middle" />
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">Start speaking Ã¢â‚¬â€ your words will appear hereÃ¢â‚¬Â¦</p>
                    )}
                  </div>

                  {/* stop button */}
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 active:scale-95"
                  >
                    <Square className="h-3.5 w-3.5 fill-white" />
                    Stop recording
                  </button>
                </div>

              ) : isTranscribing ? (
                /* Ã¢â€â‚¬Ã¢â€â‚¬ PROCESSING STATE Ã¢â€â‚¬Ã¢â€â‚¬ */
                <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  <span className="text-sm text-slate-500">Processing your speechÃ¢â‚¬Â¦</span>
                </div>

              ) : (
                /* Ã¢â€â‚¬Ã¢â€â‚¬ NORMAL COMPOSER Ã¢â€â‚¬Ã¢â€â‚¬ */
                <div className="flex items-end gap-3">
                  <div className="relative flex-1">
                    <textarea
                      value={sessionInput}
                      onChange={(event) => setSessionInput(event.target.value)}
                      placeholder="Ask what you want to understand, practise, or challenge."
                      disabled={composerDisabled}
                      rows={1}
                      className="max-h-[200px] min-h-[56px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-5 py-4 pr-12 text-[15px] leading-tight text-slate-900 outline-none transition-all focus:border-slate-300 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (sessionInput.trim() && canUseTutoringChat) {
                            logTutoringDebug("client:live-session:keyboard-submit", {
                              lessonId,
                              sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
                              text: summarizeTutoringText(sessionInput.trim(), 180),
                            });
                            void sendTutoringChatMessage(
                              createUserTextMessage(sessionInput.trim()),
                            );
                            setSessionInput("");
                          }
                        }
                      }}
                    />
                    {isVoiceInputSupported ? (
                      <button
                        type="button"
                        onClick={() => {
                          void startTranscription({
                            target: "student-session",
                            language: "multi",
                            onTranscript: (transcript) =>
                              setSessionInput((current) =>
                                appendTranscript(current, transcript),
                              ),
                          });
                        }}
                        disabled={composerDisabled}
                        className={cn(
                          "absolute bottom-2.5 right-2.5 rounded-xl p-2 transition-colors",
                          "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
                          composerDisabled && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <Mic className="h-5 w-5" />
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    disabled={composerDisabled || !sessionInput.trim()}
                    className="inline-flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              )}

              <div className="px-1">
                <p className="text-xs text-slate-500">
                  {canUseTutoringChat
                    ? isRecording
                      ? "Tap 'Stop recording' when you're done speaking Ã¢â‚¬â€ then review and send."
                      : isTranscribing
                        ? "Converting your speech to textÃ¢â‚¬Â¦"
                        : "Press Enter to send Ã‚Â· Shift + Enter for a new line."
                    : tutoringInitializationState.message}
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}


