"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  Layout,
  Sparkles,
  UploadCloud,
  Users,
  Plus,
  PlusIcon,
  ChevronDown,
  Check,
  RefreshCw,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { CreateClassroomModal } from "@/components/learning/create-classroom-modal";
import { CreateTopicModal } from "@/components/learning/create-topic-modal";
import { useTeacherLearningWorkspace } from "@/components/learning/hooks/use-teacher-learning-workspace";
import { InviteStudentModal } from "@/components/learning/invite-student-modal";
import { LogInterventionModal } from "@/components/learning/log-intervention-modal";
import { StatsCard } from "@/components/dashboard/stats-card";
import type { getTeacherLearningWorkspaceInitialData } from "@/lib/server/app-queries";
import { appLocaleLabels } from "@/lib/i18n/config";

function countReadyTopics(statuses: string[]) {
  return statuses.filter((status) => status === "active").length;
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
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const classDropdownRef = useRef<HTMLDivElement>(null);

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
    assignedSurveysQuery,
    interventionsQuery,
    uploadMaterialMutation,
    updateTopicStatusMutation,
    createClassSurveyMutation,
    updateInterventionMutation,
    resendInvitationMutation,
    cancelInvitationMutation,
    reports,
    questions,
    interventions,
    selectedStudentReport,
    selectedStudentAssignedSurveyStates,
    patternSummary,
    setSelectedClassroomId,
    setSelectedTopicId,
    setSelectedClassroomStudentId,
  } = useTeacherLearningWorkspace(initialData);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const materials = materialsQuery.data?.data ?? [];

  return (
    <div className="min-h-screen bg-slate-50/20 pb-20 pt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Header Section */}
        <div className="space-y-10">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-100 text-slate-400 text-[10px] font-medium uppercase">
                <Sparkles className="w-3 h-3" />
                Teacher Workspace
              </div>
              <h1 className="text-3xl font-medium text-slate-900 md:text-5xl leading-tight">
                Learning Hub
              </h1>
              <p className="text-slate-500 text-base max-w-xl font-medium leading-relaxed">
                Manage your classrooms, students, and AI-powered learning resources in one place.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              {/* Classroom Selection Dropdown */}
              <div className="relative" ref={classDropdownRef}>
                <div className="text-[10px] font-medium uppercase text-slate-400 px-1 mb-2">Selected Classroom</div>
                <button
                  onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:border-slate-200 transition-colors min-w-[200px]"
                >
                  <span className="truncate">{selectedDirectoryClassroom?.title ?? "Select Classroom"}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isClassDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                
                {isClassDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-sm min-w-[240px]">
                    {classrooms.length ? classrooms.map((classroom) => (
                      <button
                        key={classroom.id}
                        onClick={() => {
                          setSelectedClassroomId(classroom.id);
                          setSelectedTopicId(null);
                          setSelectedClassroomStudentId(null);
                          setIsClassDropdownOpen(false);
                        }}
                        className="flex items-center justify-between w-full px-4 py-3 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div>
                          <div className={selectedDirectoryClassroom?.id === classroom.id ? "text-sky-600" : "text-slate-700"}>{classroom.title}</div>
                          <div className="text-[9px] text-slate-400 uppercase mt-0.5">{classroom.gradeLabel}</div>
                        </div>
                        {selectedDirectoryClassroom?.id === classroom.id && <Check className="h-3 w-3 text-sky-500 flex-shrink-0" />}
                      </button>
                    )) : (
                      <div className="px-4 py-3 text-xs text-slate-400 italic">No classrooms yet</div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsCreateClassModalOpen(true)}
                className="flex items-center justify-center gap-2.5 px-6 py-4 bg-slate-900 text-white rounded-2xl font-medium hover:bg-slate-800 transition-all shadow-none self-end"
              >
                <PlusIcon className="w-5 h-5" />
                Create Classroom
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Classrooms"
              value={classrooms.length}
              icon={<GraduationCap className="w-6 h-6" />}
              iconColor="bg-blue-50 text-blue-600"
              description="Total spaces"
            />
            <StatsCard
              title="Topics"
              value={topics.length}
              icon={<BookOpen className="w-6 h-6" />}
              iconColor="bg-amber-50 text-amber-600"
              description="Active resources"
            />
            <StatsCard
              title="Students"
              value={students.length}
              icon={<Users className="w-6 h-6" />}
              iconColor="bg-violet-50 text-violet-600"
              description={selectedDirectoryClassroom ? `In ${selectedDirectoryClassroom.title}` : "Select a class"}
            />
            <StatsCard
              title="Tutor Status"
              value={countReadyTopics(topics.map((t) => t.status))}
              icon={<Sparkles className="w-6 h-6" />}
              iconColor="bg-emerald-50 text-emerald-600"
              description="AI readiness"
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="space-y-12">
          {!selectedDirectoryClassroom ? (
            <div className="p-20 text-center flex flex-col items-center justify-center min-h-[500px] border-dashed border border-slate-100 bg-white rounded-2xl">
              <div className="w-20 h-20 rounded-2xl bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
                <Layout className="w-8 h-8 text-slate-200" />
              </div>
              <h3 className="text-2xl font-medium text-slate-900 mb-3">Workspace Ready</h3>
              <p className="text-slate-500 max-w-sm mx-auto text-base leading-relaxed font-medium">
                Select a classroom from the dropdown above to manage your students, topics, and AI tutors.
              </p>
            </div>
          ) : (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Active Classroom Ribbon */}
              <div className="bg-white rounded-2xl border border-slate-100 p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Active Focus</span>
                  </div>
                  <h2 className="text-3xl font-medium text-slate-900 leading-tight">{selectedDirectoryClassroom.title}</h2>
                  <p className="text-slate-500 font-medium text-sm">
                    {selectedDirectoryClassroom.gradeLabel} <span className="mx-2 opacity-30">|</span> {selectedDirectoryClassroom.subject ?? "General"} <span className="mx-2 opacity-30">|</span> {appLocaleLabels[selectedDirectoryClassroom.defaultContentLocale]}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => createClassSurveyMutation.mutate(selectedDirectoryClassroom.id)}
                    disabled={createClassSurveyMutation.isPending}
                    className="px-5 py-3 rounded-xl bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-all flex items-center gap-2 border border-slate-100"
                  >
                    {createClassSurveyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Survey
                  </button>
                  <Link href="/dashboard/learning/reports" className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all flex items-center gap-2">
                    View Reports <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Grid for Students & Topics */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Students Section */}
                <div className="bg-white rounded-2xl border border-slate-100 p-8 space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-violet-50 text-violet-500 rounded-xl">
                        <Users className="w-5 h-5" />
                      </div>
                      <h3 className="font-medium text-slate-900">Student Directory</h3>
                    </div>
                    {canManageStudents && (
                      <button type="button" onClick={() => setIsInviteModalOpen(true)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors border border-slate-100">
                        <Plus className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {students.length ? students.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => setSelectedClassroomStudentId(student.id)}
                        className={`w-full group rounded-xl border p-5 text-left transition-all ${selectedStudent?.id === student.id ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-50 bg-slate-50/50 hover:bg-white hover:border-slate-200 text-slate-600"}`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 group-hover:text-violet-600 transition-colors leading-tight">{student.fullName}</div>
                            <div className="text-xs text-slate-400 font-medium mt-1 truncate">{student.email}</div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-medium uppercase tracking-widest ${student.inviteStatus === "joined" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {student.inviteStatus}
                          </span>
                        </div>
                      </button>
                    )) : (
                      <div className="py-20 text-center bg-slate-50/30 rounded-xl border border-dashed border-slate-100">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center mx-auto mb-4">
                          <Users className="w-6 h-6 text-slate-200" />
                        </div>
                        <p className="text-slate-400 font-medium text-sm">No students enrolled</p>
                      </div>
                    )}

                    {pendingInvitations.length > 0 && (
                      <div className="pt-6 border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-4 text-[10px] font-medium text-slate-400 uppercase tracking-widest px-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Pending Invitations
                        </div>
                        <div className="space-y-3">
                          {pendingInvitations.map((inv) => (
                            <div
                              key={inv.id}
                              className="w-full rounded-xl border border-slate-50 bg-slate-50/30 p-4 flex items-center justify-between gap-4 group"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-700 truncate">{inv.email}</div>
                                <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                  Invited {inv.createdAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(inv.createdAt)) : "Unknown Date"}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => resendInvitationMutation.mutate(inv)}
                                  disabled={resendInvitationMutation.isPending}
                                  className="p-1.5 rounded-lg bg-white border border-slate-100 text-slate-400 hover:text-sky-600 hover:border-sky-100 transition-all disabled:opacity-50"
                                  title="Resend Invitation"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${resendInvitationMutation.isPending ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancelInvitationMutation.mutate(inv)}
                                  disabled={cancelInvitationMutation.isPending}
                                  className="p-1.5 rounded-lg bg-white border border-slate-100 text-slate-400 hover:text-rose-600 hover:border-rose-100 transition-all disabled:opacity-50"
                                  title="Cancel Invitation"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Topics Section */}
                <div className="bg-white rounded-2xl border border-slate-100 p-8 space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <h3 className="font-medium text-slate-900">Learning Curriculum</h3>
                    </div>
                    <button type="button" onClick={() => setIsTopicModalOpen(true)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors border border-slate-100">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {topics.length ? topics.map((topic) => {
                      const isActiveTopic = selectedTopic?.id === topic.id;
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => setSelectedTopicId(topic.id)}
                          className={`w-full group rounded-xl border p-5 text-left transition-all ${isActiveTopic ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-50 bg-slate-50/50 hover:bg-white hover:border-slate-200 text-slate-600"}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-900 group-hover:text-amber-600 transition-colors truncate leading-tight">{topic.title}</div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${topic.status === "active" ? "bg-emerald-400" : topic.status === "paused" ? "bg-amber-400" : "bg-slate-300"}`} />
                                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest truncate">
                                  {topic.subjectLabel ?? topic.subject ?? "General"} <span className="mx-1 opacity-30">•</span> {topic.status}
                                </div>
                              </div>
                            </div>
                            <ArrowUpRight className={`w-4 h-4 transition-all ${isActiveTopic ? "text-amber-500 translate-x-0.5 -translate-y-0.5" : "text-slate-200 group-hover:text-amber-400"}`} />
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="py-20 text-center bg-slate-50/30 rounded-xl border border-dashed border-slate-100">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center mx-auto mb-4">
                          <BookOpen className="w-6 h-6 text-slate-200" />
                        </div>
                        <p className="text-slate-400 font-medium text-sm">No topics created</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Analytics & Detailed View */}
              <div className="space-y-12">
                <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-500 rounded-xl">
                      <FileText className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-medium text-slate-900">Pulse Check Overview</h3>
                  </div>
                  
                  {assignedSurveysQuery.isLoading ? (
                    <div className="flex items-center justify-center py-12 gap-3 text-slate-400 font-medium">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gathering Data...
                    </div>
                  ) : selectedStudentAssignedSurveyStates.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {selectedStudentAssignedSurveyStates.map((survey) => (
                        <div key={survey.id} className="group rounded-2xl bg-slate-50/50 p-8 border border-transparent hover:border-slate-100 hover:bg-white transition-all">
                          <div className="flex items-start justify-between gap-6">
                            <div className="space-y-2">
                              <h4 className="font-medium text-slate-900 text-lg leading-tight">{survey.title}</h4>
                              <div className="flex items-center gap-2.5 text-sm text-slate-500 font-medium">
                                <span className="text-blue-500 font-bold">{survey.completionRate}% Done</span>
                                <span className="opacity-30">|</span>
                                <span>{survey.completedCount}/{survey.assignedCount} Respondents</span>
                              </div>
                            </div>
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-medium uppercase tracking-widest border border-blue-100">
                              {survey.inProgressCount} Live
                            </span>
                          </div>
                          
                          {survey.selectedStudentState && (
                            <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center font-medium text-sm text-slate-400">
                                  {selectedStudent?.fullName.charAt(0)}
                                </div>
                                <div>
                                  <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Student Status</div>
                                  <div className="text-sm font-medium text-slate-600 capitalize">
                                    {survey.selectedStudentState.responseStatus.replace("_", " ")}
                                  </div>
                                </div>
                              </div>
                              {survey.selectedStudentState.completedAt && (
                                <div className="text-xs font-medium text-slate-400">
                                  {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(survey.selectedStudentState.completedAt))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 text-center bg-slate-50/30 rounded-2xl border border-dashed border-slate-100">
                      <p className="text-slate-400 font-medium text-lg">No active surveys yet.</p>
                      <p className="text-slate-300 text-sm mt-2 font-medium">Deploy a survey to start collecting student feedback.</p>
                    </div>
                  )}
                </div>

                {/* Topic Deep Dive */}
                {selectedTopic ? (
                  <div className="space-y-10 animate-in zoom-in-95 duration-500">
                    <div className="flex flex-col gap-6 px-1">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div className="space-y-4">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-medium uppercase tracking-widest">
                            Topic Deep Dive
                          </div>
                          <h2 className="text-3xl font-medium text-slate-900 md:text-5xl leading-tight">{selectedTopic.title}</h2>
                          <div className="flex flex-wrap items-center gap-4">
                            <span className="px-3 py-1.5 rounded-lg bg-white text-slate-500 font-medium text-xs border border-slate-100 shadow-none">
                               {selectedTopic.subjectLabel ?? selectedTopic.subject ?? "General"}
                            </span>
                            <span className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-500 font-medium text-xs border border-slate-100 shadow-none">
                              {appLocaleLabels[selectedTopic.contentLocale ?? "en"]}
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              {TOPIC_STATUSES.map((status) => {
                                const isSelected = selectedTopic.status === status;
                                return (
                                  <button
                                    key={status}
                                    type="button"
                                    onClick={() => updateTopicStatusMutation.mutate({ topicId: selectedTopic.id, status })}
                                    disabled={isSelected || updateTopicStatusMutation.isPending}
                                    className={`px-4 py-2.5 rounded-xl font-medium text-xs transition-all border ${
                                      isSelected
                                        ? "bg-slate-900 text-white border-slate-950"
                                        : "bg-white text-slate-500 border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                                    } disabled:opacity-60`}
                                  >
                                    {formatTopicStatusLabel(status)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {selectedTopic.description && (
                        <div className="max-w-4xl">
                          <p className="text-slate-500 text-base font-medium leading-relaxed italic border-l-2 border-slate-100 pl-6 py-1">
                            &ldquo;{selectedTopic.description}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                      {/* Knowledge Base */}
                      <div className="xl:col-span-5 space-y-10">
                        <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-10">
                          <h3 className="text-xl font-medium text-slate-900 flex items-center gap-4">
                            <div className="p-2.5 bg-blue-50 text-blue-500 rounded-xl">
                              <UploadCloud className="w-5 h-5" />
                            </div>
                            Knowledge Assets
                          </h3>
                          <form className="space-y-6" onSubmit={(e) => {
                            e.preventDefault();
                            if (!materialFile) { toast.error("Choose a file first."); return; }
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
                          }}>
                            <div className="space-y-5">
                              <div className="space-y-2">
                                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-widest px-1">Asset Title</label>
                                <input value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} placeholder="e.g. Chapter 1: Newton's Laws" className="w-full rounded-xl bg-white border border-slate-100 px-5 py-4 text-sm font-medium text-slate-900 outline-none focus:border-slate-300 focus:bg-slate-50/30 transition-all placeholder:text-slate-300" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-widest px-1">AI Context</label>
                                <textarea value={materialDescription} onChange={(e) => setMaterialDescription(e.target.value)} rows={2} placeholder="Briefly describe how this asset should be used..." className="w-full resize-none rounded-xl bg-white border border-slate-100 px-5 py-4 text-sm font-medium text-slate-900 outline-none focus:border-slate-300 focus:bg-slate-50/30 transition-all placeholder:text-slate-300" />
                              </div>
                              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-100 bg-slate-50/50 px-6 py-12 text-center transition-all hover:border-slate-200 hover:bg-white">
                                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                                  <UploadCloud className="w-7 h-7 text-slate-200" />
                                </div>
                                <div className="text-sm font-medium text-slate-600">{materialFile ? materialFile.name : "Select File to Index"}</div>
                                <div className="text-[10px] text-slate-400 font-medium mt-2 uppercase tracking-widest">PDF, TXT, DOC • 20MB Max</div>
                                <input type="file" accept=".pdf,.txt,.md,.doc,.docx" className="hidden" onChange={(e) => setMaterialFile(e.target.files?.[0] ?? null)} />
                              </label>
                            </div>
                            <button type="submit" disabled={uploadMaterialMutation.isPending || !materialFile} className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-900 text-white rounded-2xl text-base font-medium hover:bg-slate-800 transition-all disabled:opacity-50">
                              {uploadMaterialMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                              Index Knowledge Asset
                            </button>
                          </form>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="p-8 bg-white border border-slate-100 rounded-2xl space-y-4">
                            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Grounding Status</div>
                            <div className="text-xl font-medium text-slate-900">{readinessQuery.data?.data.ready ? "Full Coverage" : "Needs Assets"}</div>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">{readinessQuery.data?.data.summary ?? "Upload material to start indexing."}</p>
                          </div>
                          <div className="p-8 bg-white border border-slate-100 rounded-2xl space-y-4">
                            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Total Indexed</div>
                            <div className="text-xl font-medium text-slate-900">{materials.length} Assets</div>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">{reports[0] ? `${reports[0].masteryPercent}% Mastery` : "No interactions recorded yet."}</p>
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-100 p-8 space-y-6">
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Teacher Assets</div>
                              <h4 className="mt-2 text-xl font-medium text-slate-900">Open the exact material set grounding this topic</h4>
                            </div>
                            <Link href={`/dashboard/learning/topics/${selectedTopic.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-100">
                              Full Topic Detail <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>

                          <div className="space-y-3">
                            {materials.length ? (
                              materials.map((material) => (
                                <div key={material.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-slate-900">{material.title}</div>
                                      <div className="mt-1 text-[11px] font-medium uppercase tracking-widest text-slate-400">
                                        {material.materialKind} <span className="mx-1 opacity-40">•</span> {material.mimeType}
                                      </div>
                                      <div className="mt-2 text-xs font-medium text-slate-500">
                                        Extraction: {material.extractionStatus} <span className="mx-2 opacity-30">|</span> Indexing: {material.indexingStatus}
                                      </div>
                                    </div>
                                    <a
                                      href={`/api/media/learning/${material.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 transition-all hover:border-slate-200 hover:text-slate-900"
                                    >
                                      Open Asset <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-2xl border border-dashed border-slate-100 bg-slate-50/50 px-4 py-5 text-sm text-slate-400">
                                No materials uploaded for this topic yet.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Student Insights */}
                      <div className="xl:col-span-7 space-y-10">
                        <div className="bg-white rounded-2xl border border-slate-100 p-10 space-y-10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="p-2.5 bg-violet-50 text-violet-500 rounded-xl">
                                <Sparkles className="w-6 h-6" />
                              </div>
                              <h3 className="text-xl font-medium text-slate-900">Cognitive Insights</h3>
                            </div>
                            {selectedStudent && (
                              <button type="button" onClick={() => setIsInterventionModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 text-violet-600 text-[10px] font-medium uppercase tracking-widest hover:bg-violet-100 transition-all border border-violet-100">
                                <Plus className="w-4 h-4" /> Log Intervention
                              </button>
                            )}
                          </div>

                          {selectedStudent ? (
                            <div className="space-y-10">
                              <div className="flex items-center justify-between p-8 rounded-2xl bg-slate-50/50 border border-slate-100">
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Selected Student</div>
                                  <div className="text-xl font-medium text-slate-900">{selectedStudent.fullName}</div>
                                </div>
                                {selectedStudentReport && (
                                  <div className="text-right">
                                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Global Mastery</div>
                                    <div className="text-2xl font-medium text-violet-500">{selectedStudentReport.masteryPercent}%</div>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                  <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest px-1">Behavioral Patterns</div>
                                  <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 min-h-[120px]">
                                    <p className="text-sm font-medium text-slate-500 leading-relaxed italic">
                                      &ldquo;{patternSummary ?? "Generating student behavioral profile..."}&rdquo;
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest px-1">Student Queries</div>
                                  <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 min-h-[120px]">
                                    <p className="text-sm font-medium text-slate-500 leading-relaxed italic">
                                      &ldquo;{questions.find((q) => q.student.id === selectedStudent.id)?.content ?? "No student questions recorded in this topic."}&rdquo;
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-6">
                                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest px-1">Active Support Plan</div>
                                <div className="space-y-4">
                                  {interventionsQuery.isLoading ? (
                                    <div className="py-12 text-center text-slate-400 font-medium italic">Loading interventions...</div>
                                  ) : interventions.length ? (
                                    interventions.map((intervention) => (
                                      <div key={intervention.id} className="rounded-2xl bg-white p-8 border border-slate-100 group hover:border-violet-200 hover:bg-violet-50/20 transition-all">
                                        <div className="flex items-start justify-between gap-6">
                                          <div className="space-y-1.5">
                                            <div className="font-medium text-slate-900 text-lg leading-tight">{intervention.title}</div>
                                            <div className="flex items-center gap-3 text-xs font-medium text-slate-400 uppercase tracking-widest">
                                              {formatInterventionTypeLabel(intervention.interventionType)}
                                              <span className="opacity-30">•</span>
                                              <span className={intervention.priority === "high" ? "text-red-400" : ""}>{intervention.priority} Priority</span>
                                              {intervention.dueAt && (
                                                <>
                                                  <span className="opacity-30">•</span>
                                                  <span>Due {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(intervention.dueAt))}</span>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                          <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-medium uppercase tracking-widest border border-amber-100">
                                            {formatInterventionStatusLabel(intervention.status)}
                                          </span>
                                        </div>
                                        {intervention.notes && <p className="mt-6 text-sm font-medium text-slate-500 leading-relaxed">{intervention.notes}</p>}
                                        <div className="mt-8 flex flex-wrap gap-3">
                                          {intervention.status !== "in_progress" && (
                                            <button type="button" onClick={() => updateInterventionMutation.mutate({ interventionId: intervention.id, status: "in_progress", notes: intervention.notes ?? undefined, dueAt: intervention.dueAt ?? undefined })} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-medium uppercase tracking-widest hover:bg-slate-800 transition-all">Start Task</button>
                                          )}
                                          {intervention.status !== "completed" && (
                                            <button type="button" onClick={() => updateInterventionMutation.mutate({ interventionId: intervention.id, status: "completed", notes: intervention.notes ?? undefined, dueAt: intervention.dueAt ?? undefined })} className="px-5 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-medium uppercase tracking-widest hover:bg-emerald-600 transition-all">Mark Done</button>
                                          )}
                                          {intervention.status !== "dismissed" && (
                                            <button type="button" onClick={() => updateInterventionMutation.mutate({ interventionId: intervention.id, status: "dismissed", notes: intervention.notes ?? undefined, dueAt: intervention.dueAt ?? undefined })} className="px-5 py-2 rounded-xl bg-slate-50 text-slate-400 text-[10px] font-medium uppercase tracking-widest hover:bg-slate-100 hover:text-slate-600 transition-all border border-slate-100">Dismiss</button>
                                          )}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="py-12 text-center bg-slate-50/30 rounded-2xl border border-dashed border-slate-100">
                                      <p className="text-slate-400 font-medium italic">No support actions recorded for this student.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="h-[400px] flex flex-col items-center justify-center text-center bg-slate-50/30 rounded-2xl border border-dashed border-slate-100 px-8">
                              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 flex items-center justify-center mb-8">
                                <Users className="w-8 h-8 text-slate-100" />
                              </div>
                              <h4 className="text-lg font-medium text-slate-900 mb-2">Cognitive Insights</h4>
                              <p className="text-slate-400 font-medium leading-relaxed max-w-xs text-sm">
                                Select a student from the directory to review their cognitive profile and topic-specific learning patterns.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-20 text-center flex flex-col items-center justify-center min-h-[400px] border-dashed border border-slate-100 bg-white rounded-2xl">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6">
                      <BookOpen className="w-7 h-7 text-slate-200" />
                    </div>
                    <h3 className="text-2xl font-medium text-slate-900 mb-3">Topic Intelligence</h3>
                    <p className="text-slate-500 max-w-sm mx-auto text-base leading-relaxed font-medium">
                      Select a topic from the curriculum to manage grounding materials and student progress.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateClassroomModal
        isOpen={isCreateClassModalOpen}
        onClose={() => setIsCreateClassModalOpen(false)}
        onSuccess={(id) => setSelectedClassroomId(id)}
      />

      {selectedAccessibleClassroomId && (
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
          {selectedStudent && (
            <LogInterventionModal
              isOpen={isInterventionModalOpen}
              onClose={() => setIsInterventionModalOpen(false)}
              classroomId={selectedAccessibleClassroomId}
              classroomStudentId={selectedStudent.id}
              studentName={selectedStudent.fullName}
              topicId={selectedTopic?.id}
            />
          )}
        </>
      )}
    </div>
  );
}
