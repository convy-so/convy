"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { type UIMessage } from "ai";
import {
  Brain,
  ClipboardList,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  ChevronDown,
  Check,
  UserCircle,
  GraduationCap,
  ArrowRight,
  LayoutDashboard,
} from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { motion, AnimatePresence } from "framer-motion";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import { useStudentLearningWorkspace } from "@/components/learning/hooks/use-student-learning-workspace";
import type { LearningMeData } from "@/lib/api/learning";
import type {
  getOnboardingStateData,
  getStudentLearningWorkspaceInitialData,
} from "@/lib/server/app-queries";
import { StudentClassHubPanel } from "@/components/learning/student-class-hub-panel";
import { StudentInvitationCard } from "@/components/learning/student-invitation-card";
import { StudentCourseCard } from "@/components/student/student-course-card";
import { StatsCard } from "@/components/dashboard/stats-card";
import { useAuth } from "@/components/providers/auth-provider";
import { QuizCard } from "@/components/learning/generative/quiz-card";
import { GradeCard } from "@/components/learning/generative/grade-card";
import { cn } from "@/lib/utils";

type StudentLearningMeData = Extract<LearningMeData, { role: "student" }> & {
  invitations?: Array<{
    id: string;
    classroomId: string;
    classroomTitle: string;
    invitedEmail: string;
    status: string;
    expiresAt: string | null;
  }>;
};

type LiveMessage = UIMessage & {
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

function firstNameFromDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function StudentLearningHome({
  learningMe,
  initialPatterns,
  initialOnboardingState,
  initialTutoringSession,
}: {
  learningMe: StudentLearningMeData;
  initialPatterns?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialPatterns"];
  initialOnboardingState?: Awaited<ReturnType<typeof getOnboardingStateData>>;
  initialTutoringSession?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialTutoringSession"];
}) {
  const { user } = useAuth();
  const {
    memberships,
    selectedStudyLanguage,
    setSelectedMembershipId,
    selectedMembership,
    availableSurveys,
    setSelectedTopicId,
    effectiveSelectedTopicId,
    tutoringSessionQuery,
    onboardingChatMessages,
    sendOnboardingMessage,
    tutoringChatMessages,
    sendTutoringChatMessage,
    addTutoringToolResult,
    outOfSessionMutation,
    completeTutoringMutation,
    outOfSessionReply,
    setOutOfSessionReply,
    selectedTopic,
    patterns,
    membershipCount,
    invitations,
    acceptInvitationMutation,
    rejectInvitationMutation,
  } = useStudentLearningWorkspace({
    learningMe,
    initialPatterns,
    initialOnboardingState,
    initialTutoringSession,
  });

  const greetingFirstName =
    firstNameFromDisplayName(learningMe.student[0]?.fullName) ??
    firstNameFromDisplayName(user?.name) ??
    firstNameFromDisplayName(user?.email?.split("@")[0]) ??
    "there";

  const [onboardingInput, setOnboardingInput] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");

  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);

  const topicDropdownRef = useRef<HTMLDivElement>(null);

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

  const onboardingMessages = useMemo(() => {
    if (!selectedMembership?.needsOnboarding) return [];
    return onboardingChatMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: getUIMessageText(message),
    }));
  }, [onboardingChatMessages, selectedMembership?.needsOnboarding]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (topicDropdownRef.current && event.target instanceof Node && !topicDropdownRef.current.contains(event.target)) {
        setIsTopicDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f7f7] pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 pt-6 sm:pt-8">

        {/* Welcome Section */}
        <div className="flex flex-col gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <Sparkles className="h-3.5 w-3.5 text-gray-500" />
              Today&apos;s learning
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Hi, {greetingFirstName}!
            </h1>
            <p className="max-w-lg text-[15px] leading-relaxed text-gray-600">
              Pick a course below, then continue where you left off.
            </p>
          </div>

          <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:max-w-lg">
            <StatsCard
              title="Courses"
              value={membershipCount}
              icon={<GraduationCap className="h-5 w-5" />}
              iconColor="bg-gray-100 text-gray-700 border border-gray-200"
              description="Enrolled"
            />
            {patterns.length > 0 && (
              <StatsCard
                title="Insights"
                value={patterns.length}
                icon={<Brain className="h-5 w-5" />}
                iconColor="bg-gray-100 text-gray-700 border border-gray-200"
                description="Signals"
              />
            )}
          </div>
        </div>

        {/* The Grid: Classrooms & Invitations */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm">
                <GraduationCap className="h-5 w-5" />
              </span>
              Your courses
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 1. Invitations Cards (Priority) */}
            {invitations.map((invitation) => (
              <StudentInvitationCard
                key={invitation.id}
                invitation={invitation}
                onAccept={() => acceptInvitationMutation.mutate(invitation.id)}
                onDecline={() => rejectInvitationMutation.mutate(invitation.id)}
                acceptPending={
                  acceptInvitationMutation.isPending &&
                  acceptInvitationMutation.variables === invitation.id
                }
                declinePending={
                  rejectInvitationMutation.isPending &&
                  rejectInvitationMutation.variables === invitation.id
                }
              />
            ))}

            {/* 2. Classroom Cards */}
            {memberships.map((membership) => {
              const isActive = selectedMembership?.classroomStudentId === membership.classroomStudentId;
              return (
                <StudentCourseCard
                  key={membership.classroomStudentId}
                  membership={membership}
                  isActive={isActive}
                  variant="selectable"
                  onSelect={() => {
                    setSelectedMembershipId(membership.classroomStudentId);
                    setSelectedTopicId(membership.topics[0]?.id ?? null);
                    setOutOfSessionReply(null);
                  }}
                />
              );
            })}

            {/* 3. Empty State Card */}
            {memberships.length === 0 && invitations.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#e5e5e5] bg-white py-20 text-center shadow-[0_4px_0_0_#e5e5e5]">
                 <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eefbd6]">
                    <GraduationCap className="h-8 w-8 text-[#58cc02]" />
                 </div>
                 <h3 className="text-lg font-extrabold text-[#3c3c3c]">No courses yet</h3>
                 <p className="mt-2 max-w-sm px-4 text-sm font-medium leading-relaxed text-[#777777]">When your teacher adds you to a class, it will show up here. Check back soon.</p>
              </div>
            )}
          </div>
        </div>

        {/* Selected Classroom Content (Session Area) */}
        <AnimatePresence mode="wait">
          {selectedMembership && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 overflow-visible"
            >
              {/* Header for Active Area */}
              <div className="relative z-40 flex flex-col gap-4 border-b border-gray-200 py-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm">
                   <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                   <h2 className="truncate text-xl font-semibold text-gray-900">{selectedMembership.classroom.title}</h2>
                   <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Study workspace</p>
                  </div>
                </div>
                
                {/* Topic Switcher */}
                <div className="relative z-50 flex w-full flex-1 items-center justify-end sm:ml-auto sm:w-auto">
                   <div className="relative w-full sm:w-auto" ref={topicDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 sm:min-w-[200px]"
                      >
                        <span className="truncate">{selectedTopic?.title ?? "Choose topic"}</span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-500 transition-transform", isTopicDropdownOpen && "rotate-180")} />
                      </button>
                      {isTopicDropdownOpen && (
                        <div className="absolute right-0 top-full z-[100] mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg animate-in fade-in zoom-in-95 duration-150 sm:w-64">
                          {selectedMembership.topics.map(topic => (
                            <button
                              type="button"
                              key={topic.id}
                              onClick={() => {
                                setSelectedTopicId(topic.id);
                                setOutOfSessionReply(null);
                                setIsTopicDropdownOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors",
                                effectiveSelectedTopicId === topic.id ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50",
                              )}
                            >
                              <span className="truncate">{topic.title}</span>
                              {effectiveSelectedTopicId === topic.id && <Check className="h-4 w-4 shrink-0 text-gray-700" />}
                            </button>
                          ))}
                        </div>
                      )}
                   </div>
                </div>
              </div>

              <div className="relative z-10">
                <StudentClassHubPanel
                  membership={selectedMembership}
                  selectedTopicId={effectiveSelectedTopicId}
                  onSelectTopic={(id) => {
                    setSelectedTopicId(id);
                    setOutOfSessionReply(null);
                  }}
                />
              </div>

              {/* Learning Hub Content (Onboarding or Session) */}
              <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
                {/* Main Interaction Area */}
                <div className="lg:col-span-2 space-y-8">
                  {selectedMembership.needsOnboarding ? (
                    <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                      <div className="flex items-center gap-4 mb-8">
                         <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <Brain className="w-6 h-6" />
                         </div>
                         <div>
                            <h3 className="text-xl font-bold text-slate-900">Setting up your AI profile</h3>
                            <p className="text-sm text-slate-500 font-medium">This helps me adapt to how you learn best.</p>
                         </div>
                      </div>

                      <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto px-2 custom-scrollbar">
                         {onboardingMessages.map(msg => (
                           <div key={msg.id} className={cn(
                             "max-w-[85%] px-5 py-4 rounded-2xl text-sm font-medium leading-relaxed",
                             msg.role === "assistant" ? "bg-slate-50 text-slate-700 rounded-tl-none border border-slate-100" : "ml-auto bg-slate-900 text-white rounded-tr-none shadow-md"
                           )}>
                             {msg.content}
                           </div>
                         ))}
                      </div>

                      <form className="flex gap-3" onSubmit={(e) => {
                        e.preventDefault();
                        if (!onboardingInput.trim()) return;
                        sendOnboardingMessage({ text: onboardingInput.trim() });
                        setOnboardingInput("");
                      }}>
                         <input
                           value={onboardingInput}
                           onChange={e => setOnboardingInput(e.target.value)}
                           placeholder="Tell me about your learning style..."
                           className="flex-1 bg-slate-50 border-none rounded-xl px-5 py-3.5 text-sm font-bold focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                         />
                         <button className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 transition-all shadow-lg shadow-slate-100">
                            <Send className="w-5 h-5" />
                         </button>
                      </form>
                    </div>
                  ) : (
                    <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                       <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Active Session</span>
                          </div>
                          {selectedTopic && tutoringSessionQuery.data?.data.sessionId && (
                            <button 
                              onClick={() => completeTutoringMutation.mutate()}
                              className="text-[10px] font-bold uppercase text-slate-400 hover:text-red-500 transition-colors"
                            >
                              End Session
                            </button>
                          )}
                       </div>

                       <div className="h-[500px] overflow-y-auto p-8 space-y-8 custom-scrollbar">
                          {liveMessages.map((message) => (
                            <div key={message.id} className="space-y-6">
                              <div className={cn("flex items-start gap-4", message.role === "assistant" ? "justify-start" : "justify-end")}>
                                {message.role === "assistant" && (
                                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                                    <Sparkles className="w-5 h-5 text-white" />
                                  </div>
                                )}
                                <div className="flex flex-col gap-3 max-w-[80%] w-full">
                                  {message.parts?.map((part: UIMessage["parts"][0], index) => {
                                    if (part.type === "text" && part.text.trim().length > 0) {
                                      return (
                                        <div key={index} className={cn(
                                          "px-6 py-4 rounded-[1.5rem] text-sm font-medium leading-relaxed shadow-sm w-fit",
                                          message.role === "assistant" ? "bg-white text-slate-700 border border-slate-100 rounded-tl-none" : "bg-slate-900 text-white rounded-tr-none ml-auto"
                                        )}>
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
                                        if (isResolved) return null; // Hide after resolving so only text is left

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
                                {message.role === "user" && (
                                  <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                    <UserCircle className="w-6 h-6 text-slate-400" />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                       </div>

                       <div className="p-6 bg-slate-50/30 border-t border-slate-100">
                          <form className="flex gap-4" onSubmit={(e) => {
                            e.preventDefault();
                            if (!sessionInput.trim()) return;
                            sendTutoringChatMessage({ text: sessionInput.trim() });
                            setSessionInput("");
                          }}>
                             <div className="flex-1 relative group">
                                <input
                                  value={sessionInput}
                                  onChange={e => setSessionInput(e.target.value)}
                                  placeholder="Reply to the tutor..."
                                  className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
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
                                <Send className="w-5 h-5" />
                             </button>
                          </form>
                       </div>
                    </div>
                  )}
                </div>

                {/* Sidebar Info Area */}
                <div className="space-y-8">
                  {/* Pulse Checks Card */}
                  <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                       <div className="p-2.5 bg-sky-50 rounded-xl text-sky-600 border border-sky-100">
                          <ClipboardList className="w-5 h-5" />
                       </div>
                       <h3 className="font-bold text-slate-900">Pulse Checks</h3>
                    </div>
                    <div className="space-y-3">
                       {availableSurveys.length > 0 ? availableSurveys.map(s => (
                         <Link key={s.id} href={`/s/${s.shareableLink}/respond`} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-sky-300 hover:bg-sky-50/30 transition-all group">
                            <div className="min-w-0">
                               <p className="text-sm font-bold text-slate-700 truncate">{s.title}</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{formatDate(s.createdAt)}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 transition-transform group-hover:translate-x-1" />
                         </Link>
                       )) : (
                         <p className="text-xs font-bold text-slate-300 uppercase tracking-widest text-center py-6">No pending checks</p>
                       )}
                    </div>
                  </div>

                  {/* Knowledge Probe Card */}
                  <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                       <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100">
                          <MessageSquare className="w-5 h-5" />
                       </div>
                       <h3 className="font-bold text-slate-900 text-sm">Knowledge Probe</h3>
                    </div>
                    <form className="space-y-4" onSubmit={(e) => {
                      e.preventDefault();
                      if (!effectiveSelectedTopicId || !questionInput.trim()) return;
                      outOfSessionMutation.mutate({ topicId: effectiveSelectedTopicId, message: questionInput.trim(), language: selectedStudyLanguage }, { onSuccess: () => setQuestionInput("") });
                    }}>
                       <textarea
                         value={questionInput}
                         onChange={e => setQuestionInput(e.target.value)}
                         placeholder="Quick question about the topic?"
                         className="w-full bg-slate-50 border-none rounded-xl p-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-emerald-100 outline-none transition-all resize-none h-24"
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
