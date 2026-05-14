"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { type UIMessage } from "ai";
import {
  BookOpen,
  Brain,
  ClipboardList,
  Keyboard,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  ChevronDown,
  Check,
  X,
  UserCircle,
  GraduationCap,
  ArrowRight,
  Clock,
  LayoutDashboard,
} from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { motion, AnimatePresence } from "framer-motion";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import {
  appLocaleLabels,
  appLocales,
} from "@/lib/i18n/config";
import { useStudentLearningWorkspace } from "@/components/learning/hooks/use-student-learning-workspace";
import { MetricTile } from "@/components/learning/metric-tile";
import type { LearningMeData } from "@/lib/api/learning";
import { GlassPanel } from "@/components/learning/glass-panel";
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
  if (
    (assetType !== "image" && assetType !== "video") ||
    typeof title !== "string" ||
    typeof mediaUrl !== "string" ||
    typeof reason !== "string" ||
    typeof expectedBenefit !== "string"
  ) {
    return null;
  }

  return {
    assetType,
    title,
    description: typeof tutorMedia.description === "string" ? tutorMedia.description : null,
    mediaUrl,
    thumbnailUrl: typeof tutorMedia.thumbnailUrl === "string" ? tutorMedia.thumbnailUrl : null,
    reason,
    expectedBenefit,
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
    patterns,
    strongestPattern,
    membershipCount,
    invitations,
    acceptInvitationMutation,
    rejectInvitationMutation,
  } = useStudentLearningWorkspace({ learningMe });

  const [onboardingInput, setOnboardingInput] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");

  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);

  const langDropdownRef = useRef<HTMLDivElement>(null);
  const classDropdownRef = useRef<HTMLDivElement>(null);
  const topicDropdownRef = useRef<HTMLDivElement>(null);

  const {
    isSupported: isVoiceInputSupported,
    activeTarget: transcriptionTarget,
    startTranscription,
    stopRecording: stopDictation,
  } = useAudioTranscription({
    onError: (message) => toast.error(message),
  });

  const isVoiceInputMode = inputMode === "voice";

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
          id: message.id,
          role: message.role,
          content: getUIMessageText(message),
          metadata: metadataAnnotation?.data ?? {},
        };
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
      if (langDropdownRef.current && event.target instanceof Node && !langDropdownRef.current.contains(event.target)) {
        setIsLangDropdownOpen(false);
      }
      if (classDropdownRef.current && event.target instanceof Node && !classDropdownRef.current.contains(event.target)) {
        setIsClassDropdownOpen(false);
      }
      if (topicDropdownRef.current && event.target instanceof Node && !topicDropdownRef.current.contains(event.target)) {
        setIsTopicDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 pt-8">
        
        {/* Welcome Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sky-600 font-semibold text-xs uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" />
              Learning Dashboard
            </div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
              Hello, {learningMe.student[0]?.fullName?.split(' ')[0] ?? 'Explorer'} 👋
            </h1>
            <p className="text-slate-500 font-medium">Here's what's happening in your classrooms today.</p>
          </div>

          <div className="flex items-center gap-3">
             {/* Simple Metric Overview */}
             <div className="flex items-center gap-6 px-6 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Classes</span>
                  <span className="text-xl font-bold text-slate-900">{membershipCount}</span>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Insights</span>
                  <span className="text-xl font-bold text-slate-900">{patterns.length}</span>
                </div>
             </div>
          </div>
        </div>

        {/* The Grid: Classrooms & Invitations */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-500" />
              My Learning Journey
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 1. Invitations Cards (Priority) */}
            {invitations.map((invitation) => (
              <GlassPanel key={invitation.id} className="p-6 border-amber-100 bg-amber-50/30 group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/20 rounded-full -mr-12 -mt-12 blur-2xl" />
                <div className="flex flex-col h-full gap-4 relative z-10">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm border border-amber-100 text-amber-600">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <span className="px-2 py-1 rounded-full bg-amber-100 text-[10px] font-bold text-amber-700 uppercase tracking-wider border border-amber-200">
                      New Invite
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg leading-tight">{invitation.classroomTitle}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wide">Classroom Invitation</p>
                  </div>
                  <div className="flex gap-2 mt-auto pt-2">
                    <button
                      onClick={() => acceptInvitationMutation.mutate(invitation.id)}
                      className="flex-1 bg-slate-900 text-white rounded-xl py-2.5 text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
                      disabled={acceptInvitationMutation.isPending}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => rejectInvitationMutation.mutate(invitation.id)}
                      className="flex-1 bg-white border border-slate-200 text-slate-600 rounded-xl py-2.5 text-xs font-bold hover:bg-slate-50 transition-all"
                      disabled={rejectInvitationMutation.isPending}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </GlassPanel>
            ))}

            {/* 2. Classroom Cards */}
            {memberships.map((membership) => {
              const isActive = selectedMembership?.classroomStudentId === membership.classroomStudentId;
              return (
                <GlassPanel 
                  key={membership.classroomStudentId} 
                  className={cn(
                    "p-6 transition-all duration-300 group cursor-pointer hover:shadow-xl hover:-translate-y-1",
                    isActive ? "ring-2 ring-indigo-500 border-indigo-100 shadow-indigo-100/50" : "hover:border-slate-200"
                  )}
                  onClick={() => {
                    setSelectedMembershipId(membership.classroomStudentId);
                    setSelectedTopicId(membership.topics[0]?.id ?? null);
                    setOutOfSessionReply(null);
                  }}
                >
                  <div className="flex flex-col h-full gap-5">
                    <div className="flex items-start justify-between">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm border transition-colors",
                        isActive ? "bg-indigo-600 text-white border-indigo-500" : "bg-white text-slate-400 border-slate-100 group-hover:text-slate-900"
                      )}>
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{membership.classroom.gradeLabel}</span>
                        {membership.needsOnboarding && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[9px] font-bold text-blue-600 uppercase tracking-tighter border border-blue-100">
                            Setup Needed
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg leading-tight group-hover:text-indigo-600 transition-colors">{membership.classroom.title}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex -space-x-1.5">
                           {[1,2,3].map(i => <div key={i} className="w-5 h-5 rounded-full bg-slate-100 border-2 border-white ring-1 ring-slate-50" />)}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{membership.topics.length} Topics Available</span>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-widest">
                        <Clock className="w-3.5 h-3.5" />
                        {membership.topics[0]?.subjectLabel ?? "General"}
                      </span>
                      <ArrowRight className={cn("w-5 h-5 transition-transform", isActive ? "text-indigo-500 translate-x-1" : "text-slate-300 group-hover:text-slate-600")} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 3. Empty State Card */}
            {memberships.length === 0 && invitations.length === 0 && (
              <div className="col-span-full py-20 bg-white rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                 <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                    <GraduationCap className="w-8 h-8 text-slate-300" />
                 </div>
                 <h3 className="text-lg font-bold text-slate-900">Waiting for access</h3>
                 <p className="text-slate-500 text-sm max-w-xs mt-2 font-medium">Your teacher will invite you to a classroom. Once accepted, your learning journey begins here.</p>
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
              className="space-y-8"
            >
              {/* Header for Active Area */}
              <div className="flex items-center gap-4 py-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                   <LayoutDashboard className="w-5 h-5" />
                </div>
                <div>
                   <h2 className="text-xl font-bold text-slate-900">{selectedMembership.classroom.title}</h2>
                   <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Learning Workspace</p>
                </div>
                
                {/* Topic Switcher - Minimalist version of the previous control bar */}
                <div className="ml-auto flex items-center gap-3">
                   <div className="relative" ref={topicDropdownRef}>
                      <button
                        onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                        className="flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                      >
                        {selectedTopic?.title ?? "Choose Topic"}
                        <ChevronDown className={cn("w-4 h-4 transition-transform", isTopicDropdownOpen && "rotate-180")} />
                      </button>
                      {isTopicDropdownOpen && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                          {selectedMembership.topics.map(topic => (
                            <button
                              key={topic.id}
                              onClick={() => {
                                setSelectedTopicId(topic.id);
                                setOutOfSessionReply(null);
                                setIsTopicDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full px-4 py-3 text-left text-sm font-bold flex items-center justify-between transition-colors",
                                effectiveSelectedTopicId === topic.id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              {topic.title}
                              {effectiveSelectedTopicId === topic.id && <Check className="w-4 h-4" />}
                            </button>
                          ))}
                        </div>
                      )}
                   </div>
                </div>
              </div>

              {/* Learning Hub Content (Onboarding or Session) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                                <div className={cn(
                                  "max-w-[80%] px-6 py-4 rounded-[1.5rem] text-sm font-medium leading-relaxed shadow-sm",
                                  message.role === "assistant" ? "bg-white text-slate-700 border border-slate-100 rounded-tl-none" : "bg-slate-900 text-white rounded-tr-none"
                                )}>
                                  {message.content}
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
                                {isVoiceInputMode && isVoiceInputSupported && (
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
