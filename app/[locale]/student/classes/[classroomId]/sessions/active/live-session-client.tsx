"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { type UIMessage } from "ai";
import { Brain, Sparkles, Send, Mic, ArrowLeft, Loader2, ClipboardList, MessageSquare, AlertCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import { useStudentLearningWorkspace } from "@/components/learning/hooks/use-student-learning-workspace";
import type { LearningMeData } from "@/lib/api/learning";
import { QuizCard } from "@/components/learning/generative/quiz-card";
import { GradeCard } from "@/components/learning/generative/grade-card";
import { Link, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type LiveMessage = UIMessage & {
  metadata: Record<string, unknown>;
  createdAt?: string | Date;
};

interface Props {
  classroomId: string;
  learningMe: any;
  initialPatterns: any;
  initialOnboardingState: any;
  initialTutoringSession: any;
}

function getUIMessageText(message: UIMessage) {
  return (
    message.parts
      ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("") ?? ""
  );
}

function appendTranscript(currentValue: string, transcript: string) {
  const trimmedCurrent = currentValue.trim();
  return trimmedCurrent ? `${trimmedCurrent} ${transcript}`.trim() : transcript;
}

export function LiveSessionClient({ classroomId, learningMe, initialPatterns, initialOnboardingState, initialTutoringSession }: Props) {
  const router = useRouter();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [sessionInput, setSessionInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");

  const {
    selectedStudyLanguage,
    tutoringSessionQuery,
    tutoringChatMessages,
    sendTutoringChatMessage,
    addTutoringToolResult,
    completeTutoringMutation,
    outOfSessionMutation,
    outOfSessionReply,
    setOutOfSessionReply,
    selectedTopic,
    sessionState,
    effectiveSelectedTopicId
  } = useStudentLearningWorkspace({
    learningMe,
    initialPatterns,
    initialOnboardingState,
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
        const hasAnnotations = (msg: unknown): msg is { annotations: Array<{ type: string; data?: Record<string, unknown> }> } => {
          return typeof msg === 'object' && msg !== null && 'annotations' in msg;
        };
        const metadataAnnotation = hasAnnotations(message) ? message.annotations?.find(
          (ann) => ann.type === "metadata",
        ) : undefined;
        return {
          ...message,
          metadata: metadataAnnotation?.data ?? {},
        } as LiveMessage;
      }),
    [tutoringChatMessages],
  );

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [liveMessages]);

  const handleEndSession = () => {
    if (confirm("Are you sure you want to finish this tutoring session? Your teacher report will be prepared based on your progress so far.")) {
      completeTutoringMutation.mutate(undefined, {
        onSuccess: () => {
          router.replace(`/student/classes/${classroomId}/progress`);
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f7] pb-12">
      {/* Upper header */}
      <div className="bg-white border-b border-slate-100 py-4 px-6 flex items-center justify-between shadow-sm">
        <Link 
            href={`/student/classes/${classroomId}/sessions`}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
        >
            <ArrowLeft className="h-4 w-4" />
            Exit Workspace
        </Link>
        <div className="flex items-center gap-4">
            {selectedTopic && tutoringSessionQuery.data?.data.sessionId && (
                <button
                    onClick={handleEndSession}
                    disabled={completeTutoringMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-extrabold text-xs rounded-xl shadow-md shadow-red-100 transition-all disabled:opacity-50"
                >
                    {completeTutoringMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <XCircle className="h-3.5 w-3.5" />
                    )}
                    End Session
                </button>
            )}
        </div>
      </div>

      {/* Main chat workspace */}
      <div className="max-w-7xl mx-auto px-4 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column - Tutor Chat */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Live Tutoring Session</span>
                    </div>
                    {selectedTopic && (
                        <span className="text-xs font-extrabold text-slate-600 truncate max-w-[200px]">
                            {selectedTopic.title}
                        </span>
                    )}
                </div>

                {/* Chat feed */}
                <div 
                    ref={chatContainerRef}
                    className="h-[520px] overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-50/10"
                >
                    {liveMessages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 animate-bounce">
                                <Sparkles className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-slate-900 text-lg">Initialising Session</h3>
                                <p className="text-slate-500 text-sm max-w-xs font-semibold leading-relaxed">
                                    Your personal Convy AI tutor is setting up the curriculum topic context.
                                </p>
                            </div>
                        </div>
                    )}
                    {liveMessages.map((message) => (
                        <div key={message.id} className="space-y-6">
                            <div className={cn("flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300", message.role === "assistant" ? "justify-start" : "justify-end")}>
                                {message.role === "assistant" && (
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                                        <Sparkles className="w-5 h-5 text-white" />
                                    </div>
                                )}
                                <div className="flex flex-col gap-3 max-w-[80%] w-full">
                                    {message.parts?.map((part, index) => {
                                        if (part.type === "text" && part.text.trim().length > 0) {
                                            return (
                                                <div 
                                                    key={index} 
                                                    className={cn(
                                                        "px-6 py-4 rounded-[1.5rem] text-sm font-semibold leading-relaxed shadow-sm w-fit",
                                                        message.role === "assistant" 
                                                            ? "bg-white text-slate-700 border border-slate-100 rounded-tl-none mr-auto" 
                                                            : "bg-slate-900 text-white rounded-tr-none ml-auto"
                                                    )}
                                                >
                                                    {part.text}
                                                </div>
                                            );
                                        }

                                        const partAny = part as any;
                                        const isToolCall = part.type === "tool-invocation" || part.type === "dynamic-tool" || part.type.startsWith("tool-");
                                        if (isToolCall) {
                                            const toolName = part.type === "tool-invocation" ? partAny.toolInvocation?.toolName : partAny.toolName;
                                            const toolCallId = part.type === "tool-invocation" ? partAny.toolInvocation?.toolCallId : partAny.toolCallId;
                                            const args = (part.type === "tool-invocation" ? partAny.toolInvocation?.args : partAny.input || partAny.args) as Record<string, any>;
                                            const isResolved = part.type === "tool-invocation" ? (partAny.toolInvocation && "result" in partAny.toolInvocation) : (partAny.state === "output-available" || partAny.result !== undefined);

                                            if (toolName === "administer_quiz") {
                                                if (isResolved) return null;
                                                return (
                                                    <div key={index} className="w-full min-w-[300px]">
                                                        <QuizCard
                                                            quizId={args?.quizId ?? toolCallId}
                                                            conceptKey={args?.conceptKey ?? ""}
                                                            questionText={args?.questionText ?? ""}
                                                            acceptsImageUpload={args?.acceptsImageUpload ?? false}
                                                            onSubmit={({ answerText, attachments }) => {
                                                                (addTutoringToolResult as any)({
                                                                    toolCallId,
                                                                    result: { answerText, hasAttachments: !!attachments },
                                                                    output: { answerText, hasAttachments: !!attachments },
                                                                });
                                                                if (attachments) {
                                                                    (sendTutoringChatMessage as any)({ text: answerText, experimental_attachments: attachments, attachments });
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
                                                            score={args?.score !== undefined && typeof args.score === "number" ? args.score : Number(args?.score ?? 0)}
                                                            feedback={String(args?.feedback ?? "")}
                                                            masteryLevel={args?.masteryLevel && typeof args.masteryLevel === "string" ? args.masteryLevel as any : "surface"}
                                                        />
                                                    </div>
                                                );
                                            }
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Input Workspace */}
                <div className="p-6 bg-slate-50/30 border-t border-slate-100">
                    <form 
                        className="flex gap-4" 
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!sessionInput.trim()) return;
                            sendTutoringChatMessage({ text: sessionInput.trim() });
                            setSessionInput("");
                        }}
                    >
                        <div className="flex-1 relative group">
                            <input
                                value={sessionInput}
                                onChange={(e) => setSessionInput(e.target.value)}
                                placeholder="Send a message to your AI tutor..."
                                className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-semibold focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
                            />
                            {isVoiceInputSupported && (
                                <button
                                    type="button"
                                    onClick={() => startTranscription({ target: "student-session", language: "multi", onTranscript: (t) => setSessionInput((c) => appendTranscript(c, t)) })}
                                    className={cn("absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all", transcriptionTarget === "student-session" ? "text-red-500 bg-red-50 animate-pulse" : "text-slate-300 hover:text-slate-900")}
                                >
                                    <Mic className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                        <button className="px-6 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all shadow-lg shadow-slate-100">
                            <Send className="w-4.5 h-4.5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>

        {/* Right Column - Side Panel */}
        <div className="lg:col-span-1 space-y-6">
            {/* Subject Overview Card */}
            {selectedTopic && (
                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                    <h3 className="font-extrabold text-slate-900 flex items-center gap-2 mb-4">
                        <Brain className="h-5 w-5 text-indigo-500" />
                        Focus Concepts
                    </h3>
                    <p className="text-slate-600 text-xs font-semibold leading-relaxed mb-4">
                        {(selectedTopic as any).description || "You are working through a personalized learning sequence calibrating comprehension level."}
                    </p>
                    {sessionState?.knowledgeFocus && sessionState.knowledgeFocus.length > 0 && (
                        <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Target Ideas</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {sessionState.knowledgeFocus.map((concept: string, idx: number) => (
                                    <span key={idx} className="bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-xl">
                                        {concept}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Quick Probe tool */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                        <MessageSquare className="w-5 h-5" />
                    </div>
                    <h3 className="font-extrabold text-slate-900 text-sm">Knowledge Probe</h3>
                </div>
                <form 
                    className="space-y-4" 
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!effectiveSelectedTopicId || !questionInput.trim()) return;
                        outOfSessionMutation.mutate({ topicId: effectiveSelectedTopicId, message: questionInput.trim(), language: selectedStudyLanguage }, { onSuccess: () => setQuestionInput("") });
                    }}
                >
                    <textarea
                        value={questionInput}
                        onChange={(e) => setQuestionInput(e.target.value)}
                        placeholder="Quick question about the topic? Ask the AI..."
                        className="w-full bg-slate-50 border-none rounded-xl p-4 text-xs font-semibold placeholder:text-slate-300 focus:ring-2 focus:ring-emerald-100 outline-none transition-all resize-none h-24"
                    />
                    <button className="w-full bg-slate-900 text-white rounded-xl py-3 text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                        {outOfSessionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Ask Tutor
                    </button>
                </form>
                {outOfSessionReply && (
                    <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-[11px] font-medium text-slate-600 leading-relaxed italic">
                        {outOfSessionReply}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
