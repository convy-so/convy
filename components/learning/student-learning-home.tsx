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

  if (!memberships.length) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <BookOpen className="w-6 h-6 text-slate-300" />
          </div>
          <h1 className="text-xl font-medium text-slate-900">No classroom access</h1>
          <p className="mt-2 text-sm font-medium text-slate-500 max-w-md mx-auto leading-relaxed">
            Your teacher needs to invite you to a classroom before learning topics will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/20 pb-20 pt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Header Section */}
        <div className="space-y-12">
          {invitations.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[2rem] border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                 <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    <Check className="w-4 h-4" />
                 </div>
                 <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                   New Classroom Invitations
                 </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{invitation.classroomTitle}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">{invitation.invitedEmail}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptInvitationMutation.mutate(invitation.id)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-all disabled:opacity-60"
                        disabled={acceptInvitationMutation.isPending || rejectInvitationMutation.isPending}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => rejectInvitationMutation.mutate(invitation.id)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-60"
                        disabled={acceptInvitationMutation.isPending || rejectInvitationMutation.isPending}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6 max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 border border-blue-100 shadow-sm shadow-blue-100/50">
                <Sparkles className="h-3 w-3" />
                Adaptive Learning Space
              </div>
              <h1 className="text-5xl font-bold text-slate-900 md:text-7xl tracking-tight leading-[1.05]">
                Hello, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">{learningMe.student[0]?.fullName?.split(' ')[0] ?? 'Explorer'}</span>.
              </h1>
              <p className="text-xl font-medium text-slate-500 leading-relaxed max-w-xl">
                Ready to continue your journey? Your AI tutor has prepared some new insights for you.
              </p>
            </motion.div>
            
            {selectedTopic && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-shrink-0"
              >
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/40 flex flex-col items-center gap-5 min-w-[240px] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/30 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="relative w-24 h-24">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path className="text-slate-50" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <motion.path 
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: Math.max(0.1, tutoringSessionQuery.data?.data.sessionState.turnCount ? Math.min(1, tutoringSessionQuery.data?.data.sessionState.turnCount / 20) : 0.1) }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="text-blue-500" 
                          strokeWidth="3" 
                          strokeLinecap="round" 
                          stroke="currentColor" 
                          fill="none" 
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-slate-900 leading-none">{tutoringSessionQuery.data?.data.sessionState.turnCount ?? 0}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Turns</span>
                      </div>
                    </div>
                    <div className="text-center relative z-10">
                      <div className="text-sm font-bold text-slate-900 truncate max-w-[180px]">{selectedTopic.title}</div>
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-2 px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        Live Session
                      </div>
                    </div>
                 </div>
              </motion.div>
            )}
          </div>

          {/* Control Bar */}
          <div className="flex flex-col lg:flex-row items-center gap-4 p-4 rounded-2xl bg-white border border-slate-100">
            {/* Classroom Dropdown */}
            <div className="relative flex-1 w-full" ref={classDropdownRef}>
              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1 mb-1.5">Classroom</div>
              <button
                onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all"
              >
                <span className="truncate">{selectedMembership?.classroom.title ?? "Select Classroom"}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isClassDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              
              {isClassDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-sm">
                  {memberships.map((membership) => (
                    <button
                      key={membership.classroomStudentId}
                      onClick={() => {
                        setSelectedMembershipId(membership.classroomStudentId);
                        setSelectedTopicId(membership.topics[0]?.id ?? null);
                        setOutOfSessionReply(null);
                        setIsClassDropdownOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div>
                        <div className={selectedMembership?.classroomStudentId === membership.classroomStudentId ? "text-slate-900" : "text-slate-700"}>{membership.classroom.title}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{membership.classroom.gradeLabel}</div>
                      </div>
                      {selectedMembership?.classroomStudentId === membership.classroomStudentId && <Check className="h-4 w-4 text-slate-900 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Topic Dropdown */}
            <div className="relative flex-1 w-full" ref={topicDropdownRef}>
              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1 mb-1.5">Topic</div>
              <button
                onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all"
              >
                <span className="truncate">{selectedTopic?.title ?? "Select Topic"}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isTopicDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              
              {isTopicDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-sm">
                  {selectedMembership?.topics.length ? selectedMembership.topics.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        setOutOfSessionReply(null);
                        setIsTopicDropdownOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="truncate pr-4">
                        <div className={effectiveSelectedTopicId === topic.id ? "text-slate-900" : "text-slate-700 truncate"}>{topic.title}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{topic.subjectLabel ?? "Focus"}</div>
                      </div>
                      {effectiveSelectedTopicId === topic.id && <Check className="h-4 w-4 text-slate-900 flex-shrink-0" />}
                    </button>
                  )) : (
                    <div className="px-4 py-3 text-sm text-slate-400 italic">No topics available</div>
                  )}
                </div>
              )}
            </div>

            <div className="hidden lg:block w-px h-12 bg-slate-100 mx-2"></div>

            {/* Controls (Language & Input Mode) */}
            <div className="flex items-center gap-4 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-40" ref={langDropdownRef}>
                <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1 mb-1.5">Language</div>
                <button
                  onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all"
                >
                  <span className="truncate">{appLocaleLabels[selectedStudyLanguage]}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isLangDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                
                {isLangDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-sm">
                    {appLocales.map((language) => (
                      <button
                        key={language}
                        onClick={() => {
                          setSelectedStudyLanguage(language);
                          setIsLangDropdownOpen(false);
                        }}
                        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
                      >
                        <span className={selectedStudyLanguage === language ? "text-slate-900" : "text-slate-700"}>
                          {appLocaleLabels[language]}
                        </span>
                        {selectedStudyLanguage === language && <Check className="h-4 w-4 text-slate-900 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1 mb-1.5">Input</div>
                <div className="inline-flex h-[46px] items-center rounded-xl bg-slate-50/50 p-1 border border-slate-100">
                  <button 
                    onClick={() => { stopDictation(); setInputMode("text"); }} 
                    className={`h-full px-3 flex items-center justify-center rounded-lg transition-all ${inputMode === "text" ? "bg-white text-slate-900 border border-slate-100 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    <Keyboard className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => setInputMode("voice")} 
                    className={`h-full px-3 flex items-center justify-center rounded-lg transition-all ${inputMode === "voice" ? "bg-white text-slate-900 border border-slate-100 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
            <MetricTile label="Enrollment" value={String(membershipCount)} helper="Joined classes" color="blue" />
            <MetricTile label="Availability" value={String(selectedMembership?.topics.length ?? 0)} helper="Ready topics" color="violet" />
            <MetricTile label="Your Patterns" value={String(patterns.length)} helper="Cognitive insights" color="emerald" accent={strongestPattern ? "Active" : undefined} />
            <MetricTile label="Current Phase" value={currentStageId ? formatPhaseLabel(currentStageId) : "Ready"} helper="Session status" color="amber" accent={currentStageId ? "Live" : undefined} />
          </div>
        </div>

        <div className="space-y-12">
          

          <div className="space-y-12">
            {selectedMembership?.needsOnboarding ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-10">
                <div className="space-y-3">
                  <h2 className="text-2xl font-medium text-slate-900">Onboarding</h2>
                  <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-xl">
                    Help the tutor understand how you process information to create a truly personalized learning journey.
                  </p>
                </div>
                
                <div className="space-y-6 max-h-[500px] overflow-y-auto p-8 bg-slate-50/50 rounded-2xl border border-slate-100">
                  {onboardingMessages.map((message) => (
                    <div 
                      key={message.id} 
                      className={`max-w-[85%] rounded-xl px-5 py-4 text-sm font-medium leading-relaxed ${
                        message.role === "assistant" 
                        ? "bg-white text-slate-600 border border-slate-100" 
                        : "ml-auto bg-slate-900 text-white border border-slate-900 shadow-sm"
                      }`}
                    >
                      {message.content}
                    </div>
                  ))}
                </div>
                
                <form 
                  className="flex gap-4" 
                  onSubmit={(e) => { 
                    e.preventDefault(); 
                    if (!onboardingInput.trim()) return; 
                    sendOnboardingMessage({ text: onboardingInput.trim() }); 
                    setOnboardingInput(""); 
                  }}
                >
                  <input 
                    value={onboardingInput} 
                    onChange={(e) => setOnboardingInput(e.target.value)} 
                    placeholder="Type your message..." 
                    className="flex-1 rounded-xl border border-slate-100 bg-slate-50/50 px-5 py-4 text-sm font-medium outline-none transition focus:border-slate-300 focus:bg-white" 
                  />
                  <button 
                    type="submit" 
                    disabled={onboardingChatStatus !== "ready" || !onboardingInput.trim()} 
                    className="p-4 bg-slate-900 text-white rounded-xl transition-all hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-10">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <h2 className="text-2xl font-medium text-slate-900">{selectedTopic?.title ?? "Learning Session"}</h2>
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Active Session</span>
                      </div>
                    </div>
                    {selectedTopic && tutoringSessionQuery.data?.data.sessionId && (
                      <button 
                        onClick={() => completeTutoringMutation.mutate()} 
                        className="text-[10px] font-medium uppercase text-slate-400 hover:text-slate-900 transition-colors border border-slate-100 rounded-lg px-4 py-2 hover:bg-slate-50"
                      >
                        Finish
                      </button>
                    )}
                  </div>

                  {selectedTopic ? (
                    <div className="space-y-10">
                      <div className="space-y-6 max-h-[600px] overflow-y-auto p-10 bg-slate-50/50 rounded-2xl border border-slate-100 custom-scrollbar">
                        {liveMessages.map((message) => (
                          <div key={message.id} className="space-y-6">
                            <div className={`flex items-start gap-4 ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
                              {message.role === "assistant" && (
                                <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-100 ring-4 ring-blue-50">
                                  <Sparkles className="w-5 h-5 text-white" />
                                </div>
                              )}
                              <div 
                                className={`max-w-[80%] rounded-[1.5rem] px-6 py-4 text-sm font-medium leading-relaxed ${
                                  message.role === "assistant" 
                                  ? "bg-white text-slate-700 border border-slate-100 shadow-sm rounded-tl-none" 
                                  : "bg-slate-900 text-white border border-slate-900 shadow-lg shadow-slate-200/50 rounded-tr-none"
                                }`}
                              >
                                {message.content}
                              </div>
                              {message.role === "user" && (
                                <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                                  <UserCircle className="w-6 h-6 text-slate-400" />
                                </div>
                              )}
                            </div>
                            
                            {message.role === "assistant" && (() => {
                              const media = getTutorMediaMetadata(message.metadata);
                              if (!media) return null;
                              return (
                                <div className="ml-14 max-w-[85%] rounded-[2rem] border border-slate-100 bg-white p-8 space-y-6 shadow-sm">
                                  <div className="flex items-center gap-3">
                                     <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                                        <BookOpen className="w-4 h-4" />
                                     </div>
                                     <h4 className="text-base font-bold text-slate-900 tracking-tight">{media.title}</h4>
                                  </div>
                                  <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 shadow-inner">
                                    {media.assetType === "image" 
                                      ? <Image src={media.mediaUrl} width={800} height={450} className="w-full h-auto object-cover max-h-[450px]" alt={media.title} /> 
                                      : <video controls className="w-full h-auto max-h-[450px] bg-black"><source src={media.mediaUrl} /></video>
                                    }
                                  </div>
                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="p-5 rounded-2xl bg-slate-50/50 space-y-2 border border-slate-100/50">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Purpose</div>
                                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{media.reason}</p>
                                    </div>
                                    <div className="p-5 rounded-2xl bg-slate-50/50 space-y-2 border border-slate-100/50">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expected Outcome</div>
                                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{media.expectedBenefit}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>

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
                            placeholder="Message the tutor..." 
                            className="w-full rounded-xl border border-slate-100 bg-slate-50/50 px-5 py-4 text-sm font-medium outline-none transition focus:border-slate-300 focus:bg-white pr-14" 
                          />
                          {isVoiceInputMode && isVoiceInputSupported && (
                            <button 
                              type="button" 
                              onClick={() => startTranscription({ target: "student-session", language: "multi", onTranscript: (t) => setSessionInput((c) => appendTranscript(c, t)) })} 
                              className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${transcriptionTarget === "student-session" ? "text-red-500 bg-red-50 animate-pulse" : "text-slate-400 hover:text-slate-900"}`}
                            >
                              <Mic className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                        <button 
                          type="submit" 
                          disabled={tutoringChatStatus !== "ready" || !sessionInput.trim()} 
                          className="p-4 bg-slate-900 text-white rounded-xl transition-all hover:bg-slate-800 disabled:opacity-50"
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="py-32 text-center bg-slate-50/30 rounded-2xl border border-dashed border-slate-100 flex flex-col items-center">
                      <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 flex items-center justify-center mb-6">
                        <Sparkles className="w-7 h-7 text-slate-100" />
                      </div>
                      <p className="text-xs font-medium text-slate-300 uppercase tracking-widest max-w-[240px] leading-relaxed">
                        Select a topic to begin your session
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                  <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-50/50 rounded-xl text-blue-500 border border-blue-100/50">
                        <ClipboardList className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-medium text-slate-900">Pulse Checks</h3>
                        <p className="text-[9px] font-medium text-slate-400 uppercase mt-1">Class Assessments</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {availableSurveys.length ? availableSurveys.map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-5 rounded-xl bg-slate-50/50 border border-transparent hover:border-slate-100 hover:bg-white transition-all">
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-700">{s.title}</div>
                            <div className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{formatDate(s.createdAt)}</div>
                          </div>
                          <Link 
                            href={`/s/${s.shareableLink}/respond`} 
                            className="text-[10px] font-medium px-5 py-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all"
                          >
                            Enter
                          </Link>
                        </div>
                      )) : <div className="text-[10px] font-medium text-slate-300 py-10 text-center uppercase tracking-widest">Clear for now</div>}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-violet-50/50 rounded-xl text-violet-500 border border-violet-100/50">
                        <Brain className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-medium text-slate-900">Patterns</h3>
                        <p className="text-[9px] font-medium text-slate-400 uppercase mt-1">Learning Insights</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {strongestPattern ? patterns.slice(0, 3).map((p, i) => (
                        <div key={i} className="group relative p-6 rounded-2xl bg-gradient-to-br from-violet-50/50 to-white border border-violet-100 hover:shadow-lg hover:shadow-violet-200/20 transition-all cursor-default">
                          <div className="absolute top-4 right-4 text-violet-300 group-hover:text-violet-500 transition-colors">
                            <Brain className="w-4 h-4 opacity-20" />
                          </div>
                          <div className="text-[11px] font-bold text-violet-600 uppercase tracking-wider mb-2">{p.scopeType}</div>
                          <p className="text-sm font-medium text-slate-600 italic leading-relaxed">
                            &ldquo;{p.studentSummary}&rdquo;
                          </p>
                        </div>
                      )) : (
                        <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-4 rounded-2xl border border-dashed border-slate-100 bg-slate-50/30">
                           <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                              <Loader2 className="w-5 h-5 text-slate-200 animate-spin" />
                           </div>
                           <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                             Gathering cognitive evidence...
                           </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-50/50 rounded-xl text-emerald-500 border border-emerald-100/50">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-medium text-slate-900">Knowledge Probe</h3>
                      <p className="text-[9px] font-medium text-slate-400 uppercase mt-1">Quick Q&A</p>
                    </div>
                  </div>
                  <div className="space-y-8">
                    <form 
                      className="flex gap-4" 
                      onSubmit={(e) => { 
                        e.preventDefault(); 
                        if (!effectiveSelectedTopicId || !questionInput.trim()) return; 
                        outOfSessionMutation.mutate({ topicId: effectiveSelectedTopicId, message: questionInput.trim(), language: selectedStudyLanguage }, { onSuccess: () => setQuestionInput("") }); 
                      }}
                    >
                      <input 
                        value={questionInput} 
                        onChange={(e) => setQuestionInput(e.target.value)} 
                        placeholder="Type a quick question..." 
                        className="flex-1 rounded-xl border border-slate-100 bg-slate-50/50 px-5 py-4 text-sm font-medium outline-none transition focus:border-slate-200 focus:bg-white" 
                      />
                      <button 
                        type="submit" 
                        disabled={outOfSessionMutation.isPending || !questionInput.trim()} 
                        className="p-4 bg-slate-900 text-white rounded-xl transition-all hover:bg-slate-800"
                      >
                        {outOfSessionMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      </button>
                    </form>
                    {outOfSessionReply && (
                      <div className="p-8 rounded-xl bg-emerald-50/50 border border-emerald-100/50 text-xs font-medium text-slate-600 leading-relaxed italic">
                        {outOfSessionReply}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
