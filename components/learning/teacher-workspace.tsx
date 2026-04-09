"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Loader2,
  Lock,
  MailPlus,
  Layout,
  Sparkles,
  Unplug,
  UploadCloud,
  Users,
  Plus,
  PlusIcon,
} from "lucide-react";
import toast from "react-hot-toast";

import { GlassPanel } from "@/components/learning/glass-panel";
import { MetricTile } from "@/components/learning/metric-tile";
import { SectionHeading } from "@/components/learning/section-heading";
import { Link, useRouter } from "@/i18n/routing";
import {
  fetchClassroomAssignedSurveys,
  fetchClassroomCollaborators,
  fetchClassroomAccessRequests,
  fetchClassroomStudents,
  fetchClassroomTopics,
  fetchLearningInterventions,
  fetchStudentPatterns,
  fetchTeacherClassrooms,
  fetchTopicMaterials,
  fetchTopicQuestions,
  fetchTopicReadiness,
  fetchTopicReports,
  grantClassroomCollaborator,
  requestClassroomAccess,
  revokeClassroomCollaborator,
  respondToClassroomAccessRequest,
  updateTopicStatus,
  updateLearningIntervention,
  uploadTopicMaterial,
} from "@/lib/api/learning";
import { createSurveyDraft } from "@/lib/api/surveys";
import {
  fetchActiveWorkspace,
  fetchWorkspaceDepartments,
} from "@/lib/api/workspace";
import { queryKeys } from "@/lib/query-keys";
import { CreateWorkspaceModal } from "@/components/dashboard/create-workspace-modal";
import { CreateClassroomModal } from "@/components/learning/create-classroom-modal";
import { CreateTopicModal } from "@/components/learning/create-topic-modal";
import { InviteStudentModal } from "@/components/learning/invite-student-modal";
import { LogInterventionModal } from "@/components/learning/log-intervention-modal";
import { StatsCard } from "@/components/dashboard/stats-card";

function countReadyTopics(statuses: string[]) {
  return statuses.filter((status) => status === "active").length;
}



function accessMeta(level: "owner" | "collaborator" | "none") {
  if (level === "owner") {
    return { label: "Owner", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (level === "collaborator") {
    return { label: "Collaborator", tone: "border-sky-200 bg-sky-50 text-sky-700" };
  }
  return { label: "Locked", tone: "border-slate-200 bg-slate-100 text-slate-600" };
}

type InterventionType =
  | "reteach"
  | "check_in"
  | "practice"
  | "family_follow_up";

type InterventionPriority = "low" | "medium" | "high";

function isInterventionType(value: string): value is InterventionType {
  return (
    value === "reteach" ||
    value === "check_in" ||
    value === "practice" ||
    value === "family_follow_up"
  );
}

function isInterventionPriority(value: string): value is InterventionPriority {
  return value === "low" || value === "medium" || value === "high";
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

export function TeacherWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [collaboratorInviteEmail, setCollaboratorInviteEmail] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [accessRequestMessage, setAccessRequestMessage] = useState("");

  const activeWorkspaceQuery = useQuery({
    queryKey: queryKeys.workspaces.active,
    queryFn: fetchActiveWorkspace,
  });

  const activeWorkspace = activeWorkspaceQuery.data;

  const classroomsQuery = useQuery({
    queryKey: queryKeys.learning.classrooms,
    queryFn: fetchTeacherClassrooms,
    enabled: Boolean(activeWorkspace?.id),
  });

  const departmentsQuery = useQuery({
    queryKey: activeWorkspace?.id
      ? queryKeys.workspaces.departments(activeWorkspace.id)
      : ["workspaceDepartments", "idle"],
    queryFn: async () => {
      if (!activeWorkspace?.id) {
        return [];
      }
      return fetchWorkspaceDepartments(activeWorkspace.id);
    },
    enabled: Boolean(activeWorkspace?.id),
  });

  const classrooms = useMemo(() => classroomsQuery.data?.data ?? [], [classroomsQuery.data]);
  const departments = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data]);
  const selectedDirectoryClassroom =
    classrooms.find((classroom) => classroom.id === selectedClassroomId) ??
    classrooms[0] ??
    null;
  const classroomAccessLevel = selectedDirectoryClassroom?.accessLevel ?? "none";
  const selectedAccessibleClassroomId =
    classroomAccessLevel === "none" ? null : selectedDirectoryClassroom?.id ?? null;
  const canCollaborate = classroomAccessLevel !== "none";
  const canManageStudents = classroomAccessLevel === "owner";

  const studentsQuery = useQuery({
    queryKey: selectedAccessibleClassroomId
      ? queryKeys.learning.students(selectedAccessibleClassroomId)
      : ["learningStudents", "idle"],
    queryFn: async () => {
      if (!selectedAccessibleClassroomId) {
        throw new Error("Missing classroom id");
      }
      return fetchClassroomStudents(selectedAccessibleClassroomId);
    },
    enabled: Boolean(selectedAccessibleClassroomId),
  });
  const topicsQuery = useQuery({
    queryKey: selectedAccessibleClassroomId
      ? queryKeys.learning.topics(selectedAccessibleClassroomId)
      : ["learningTopics", "idle"],
    queryFn: async () => {
      if (!selectedAccessibleClassroomId) {
        throw new Error("Missing classroom id");
      }
      return fetchClassroomTopics(selectedAccessibleClassroomId);
    },
    enabled: Boolean(selectedAccessibleClassroomId),
  });
  const students = useMemo(() => studentsQuery.data?.data ?? [], [studentsQuery.data]);
  const topics = useMemo(() => topicsQuery.data?.data ?? [], [topicsQuery.data]);
  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? students[0] ?? null;
  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0] ?? null;

  const materialsQuery = useQuery({
    queryKey: selectedTopic ? queryKeys.learning.materials(selectedTopic.id) : ["learningMaterials", "idle"],
    queryFn: async () => {
      if (!selectedTopic) {
        throw new Error("Missing topic");
      }
      return fetchTopicMaterials(selectedTopic.id);
    },
    enabled: Boolean(selectedTopic),
  });
  const readinessQuery = useQuery({
    queryKey: selectedTopic ? queryKeys.learning.readiness(selectedTopic.id) : ["learningReadiness", "idle"],
    queryFn: async () => {
      if (!selectedTopic) {
        throw new Error("Missing topic");
      }
      return fetchTopicReadiness(selectedTopic.id);
    },
    enabled: Boolean(selectedTopic),
  });
  const reportsQuery = useQuery({
    queryKey: selectedTopic ? queryKeys.learning.reports(selectedTopic.id) : ["learningReports", "idle"],
    queryFn: async () => {
      if (!selectedTopic) {
        throw new Error("Missing topic");
      }
      return fetchTopicReports(selectedTopic.id);
    },
    enabled: Boolean(selectedTopic),
  });
  const questionsQuery = useQuery({
    queryKey: selectedTopic ? queryKeys.learning.questions(selectedTopic.id) : ["learningQuestions", "idle"],
    queryFn: async () => {
      if (!selectedTopic) {
        throw new Error("Missing topic");
      }
      return fetchTopicQuestions(selectedTopic.id);
    },
    enabled: Boolean(selectedTopic),
  });
  const studentPatternsQuery = useQuery({
    queryKey: selectedStudent ? queryKeys.learning.studentPatterns(selectedStudent.id) : ["learningStudentPatterns", "idle"],
    queryFn: async () => {
      if (!selectedStudent) {
        throw new Error("Missing student");
      }
      return fetchStudentPatterns(selectedStudent.id);
    },
    enabled: Boolean(selectedStudent),
  });
  const accessRequestsQuery = useQuery({
    queryKey: selectedDirectoryClassroom
      ? queryKeys.learning.classroomRequests(selectedDirectoryClassroom.id)
      : ["learningClassroomRequests", "idle"],
    queryFn: async () => {
      if (!selectedDirectoryClassroom) {
        throw new Error("Missing classroom");
      }
      return fetchClassroomAccessRequests(selectedDirectoryClassroom.id);
    },
    enabled: classroomAccessLevel === "owner",
  });
  const collaboratorsQuery = useQuery({
    queryKey: selectedDirectoryClassroom
      ? queryKeys.learning.classroomCollaborators(selectedDirectoryClassroom.id)
      : ["learningClassroomCollaborators", "idle"],
    queryFn: async () => {
      if (!selectedDirectoryClassroom) {
        throw new Error("Missing classroom");
      }
      return fetchClassroomCollaborators(selectedDirectoryClassroom.id);
    },
    enabled: classroomAccessLevel === "owner",
  });
  const assignedSurveysQuery = useQuery({
    queryKey: selectedAccessibleClassroomId
      ? queryKeys.learning.assignedSurveys(selectedAccessibleClassroomId)
      : ["learningAssignedSurveys", "idle"],
    queryFn: async () => {
      if (!selectedAccessibleClassroomId) {
        throw new Error("Missing classroom");
      }
      return fetchClassroomAssignedSurveys(selectedAccessibleClassroomId);
    },
    enabled: Boolean(selectedAccessibleClassroomId),
  });
  const interventionsQuery = useQuery({
    queryKey:
      selectedAccessibleClassroomId && selectedStudent
        ? queryKeys.learning.interventions(
            selectedAccessibleClassroomId,
            selectedStudent.id,
            selectedTopic?.id ?? null,
          )
        : ["learningInterventions", "idle"],
    queryFn: async () => {
      if (!selectedAccessibleClassroomId || !selectedStudent) {
        throw new Error("Missing intervention context");
      }
      return fetchLearningInterventions({
        classroomId: selectedAccessibleClassroomId,
        classroomStudentId: selectedStudent.id,
        topicId: selectedTopic?.id,
      });
    },
    enabled: Boolean(selectedAccessibleClassroomId && selectedStudent),
  });


  const requestClassroomAccessMutation = useMutation({
    mutationFn: requestClassroomAccess,
    onSuccess: async () => {
      setAccessRequestMessage("");
      toast.success("Access request sent");
      await queryClient.invalidateQueries({ queryKey: queryKeys.learning.classrooms });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to request classroom access"),
  });
  const respondToRequestMutation = useMutation({
    mutationFn: respondToClassroomAccessRequest,
    onSuccess: async (_, variables) => {
      toast.success(variables.decision === "approved" ? "Access approved" : "Access declined");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.classrooms }),
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.classroomRequests(variables.classroomId) }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to review access request"),
  });
  const uploadMaterialMutation = useMutation({
    mutationFn: uploadTopicMaterial,
    onSuccess: async () => {
      setMaterialTitle("");
      setMaterialDescription("");
      setMaterialFile(null);
      toast.success("Material uploaded");
      if (selectedTopic) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.learning.materials(selectedTopic.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.learning.readiness(selectedTopic.id) }),
        ]);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to upload material"),
  });
  const updateTopicStatusMutation = useMutation({
    mutationFn: ({ topicId, status }: { topicId: string; status: "draft" | "active" | "paused" | "archived" }) =>
      updateTopicStatus(topicId, status),
    onSuccess: async () => {
      toast.success("Topic status updated");
      if (selectedAccessibleClassroomId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.learning.topics(selectedAccessibleClassroomId) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update topic"),
  });
  const createClassSurveyMutation = useMutation({
    mutationFn: async (classroomId: string) =>
      createSurveyDraft({
        deliveryMode: "classroom_assigned",
        classroomId,
      }),
    onSuccess: async (data) => {
      toast.success("Class-linked survey draft created");
      await queryClient.invalidateQueries({ queryKey: queryKeys.surveys.all(activeWorkspace?.id ?? null) });
      router.push(`/dashboard/create?surveyId=${encodeURIComponent(data.id)}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to create class-linked survey",
      ),
  });
  const revokeCollaboratorMutation = useMutation({
    mutationFn: revokeClassroomCollaborator,
    onSuccess: async (_, variables) => {
      toast.success("Collaborator removed");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.classroomCollaborators(variables.classroomId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.classrooms,
        }),
      ]);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to remove collaborator",
      ),
  });
  const grantCollaboratorMutation = useMutation({
    mutationFn: grantClassroomCollaborator,
    onSuccess: async (_, variables) => {
      setCollaboratorInviteEmail("");
      toast.success("Collaborator added");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.classroomCollaborators(variables.classroomId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.classroomRequests(variables.classroomId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.classrooms }),
      ]);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to grant collaborator access",
      ),
  });

  const updateInterventionMutation = useMutation({
    mutationFn: updateLearningIntervention,
    onSuccess: async () => {
      toast.success("Intervention updated");
      if (selectedAccessibleClassroomId && selectedStudent) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.learning.interventions(
            selectedAccessibleClassroomId,
            selectedStudent.id,
            selectedTopic?.id ?? null,
          ),
        });
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to update intervention",
      ),
  });

  const reportsPayload = reportsQuery.data?.data ?? null;
  const reports = reportsPayload?.reports ?? [];
  const questions = questionsQuery.data?.data ?? [];
  const assignedSurveys = assignedSurveysQuery.data?.data ?? [];
  const interventions = interventionsQuery.data?.data ?? [];
  const selectedStudentReport =
    reports.find((report) => report.student.id === selectedStudent?.id) ?? null;
  const pendingAccessRequests = accessRequestsQuery.data?.data ?? [];
  const collaborators = collaboratorsQuery.data?.data ?? [];
  const selectedStudentAssignedSurveyStates = assignedSurveys.map((survey) => ({
    ...survey,
    selectedStudentState:
      survey.students.find((student) => student.classroomStudentId === selectedStudent?.id) ??
      null,
  }));
  const patternSummary = studentPatternsQuery.data?.data.profiles[0]?.studentSummary ?? null;

  if (activeWorkspaceQuery.isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  }

  if (!activeWorkspace) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-24 text-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[24px] border border-slate-100 bg-white text-slate-400">
          <Building2 className="h-10 w-10" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
            Create a workspace
          </h1>
          <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-slate-500">
            Classrooms, departments, and academic units are organized within workspaces. Set up your first one to get started.
          </p>
        </div>

        <div className="mt-8">
          <button
            onClick={() => setIsWorkspaceModalOpen(true)}
            className="group inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-900"
          >
            Create workspace
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <CreateWorkspaceModal 
          isOpen={isWorkspaceModalOpen}
          onClose={() => setIsWorkspaceModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#111111] tracking-tight">
            Learning Hub
          </h1>
          <p className="text-[#666666] mt-1 lg:mt-2 text-sm lg:text-base">
            Manage classrooms, AI tutors, and student performance.
          </p>
        </div>
        <button
          onClick={() => setIsCreateClassModalOpen(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors group w-full sm:w-auto"
        >
          <PlusIcon className="w-5 h-5" />
          New classroom
          <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatsCard
          title="Classrooms"
          value={classrooms.length}
          icon={<GraduationCap className="w-6 h-6" />}
          iconColor="bg-blue-50 text-blue-600"
          description="Total classes in this workspace"
        />
        <StatsCard
          title="Accessible"
          value={classrooms.filter((c) => c.accessLevel !== "none").length}
          icon={<Lock className="w-6 h-6" />}
          iconColor="bg-emerald-50 text-emerald-600"
          description="Classes you can manage"
        />
        <StatsCard
          title="Students"
          value={students.length}
          icon={<Users className="w-6 h-6" />}
          iconColor="bg-purple-50 text-purple-600"
          description={selectedDirectoryClassroom ? `In ${selectedDirectoryClassroom.title}` : "Select a class"}
        />
        <StatsCard
          title="Active Tutors"
          value={countReadyTopics(topics.map((t) => t.status))}
          icon={<Sparkles className="w-6 h-6" />}
          iconColor="bg-amber-50 text-amber-600"
          description="Ready for interaction"
        />
      </div>

      <CreateClassroomModal
        isOpen={isCreateClassModalOpen}
        onClose={() => setIsCreateClassModalOpen(false)}
        onSuccess={(id) => setSelectedClassroomId(id)}
        departments={departments}
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
              studentId={selectedStudent.id}
              studentName={selectedStudent.fullName}
              topicId={selectedTopic?.id}
            />
          )}
        </>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6">
        {/* Left Sidebar — Classroom Directory */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Classrooms</h2>
          </div>
          <div className="space-y-3">
            {classrooms.length ? classrooms.map((classroom) => {
              const meta = accessMeta(classroom.accessLevel);
              const isActive = classroom.id === selectedDirectoryClassroom?.id;
              return (
                <button
                  key={classroom.id}
                  type="button"
                  onClick={() => { setSelectedClassroomId(classroom.id); setSelectedTopicId(null); setSelectedStudentId(null); }}
                  className={`group w-full bg-white rounded-2xl border p-4 text-left transition-all duration-300 ${isActive ? "" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{classroom.title}</div>
                      <div className="mt-1 text-sm text-gray-500">{classroom.gradeLabel} · {classroom.subject ?? "General"}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {classroom.departmentName && (
                          <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600 border border-gray-100">{classroom.departmentName}</span>
                        )}
                        <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600 border border-gray-100">{classroom.teacherName}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.tone}`}>{meta.label}</span>
                      {classroom.accessRequestStatus === "pending" && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Pending</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            }) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                  <GraduationCap className="w-7 h-7 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">No classrooms yet</h3>
                <p className="text-sm text-gray-500 max-w-[220px] mx-auto">Create your first classroom to start managing students.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Classroom Detail */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedDirectoryClassroom ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                <Layout className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a classroom</h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                Choose a classroom from the left to manage students, topics, and AI tutors.
              </p>
            </div>
          ) : !canCollaborate ? (
            /* Locked classroom — request access */
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900">{selectedDirectoryClassroom.title}</h2>
                <p className="mt-1 text-sm text-gray-500">This classroom is visible but locked. Request access from the owner.</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-2 text-gray-600">
                    <div className="font-medium text-gray-900 flex items-center gap-2"><Lock className="w-4 h-4 text-gray-400" /> Details</div>
                    <div>Owner: {selectedDirectoryClassroom.teacherName}</div>
                    <div>Grade: {selectedDirectoryClassroom.gradeLabel}</div>
                    <div>Department: {selectedDirectoryClassroom.departmentName ?? "None"}</div>
                    <div>Students: {selectedDirectoryClassroom.studentCount} · Topics: {selectedDirectoryClassroom.topicCount}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <div className="font-medium text-gray-900 text-sm flex items-center gap-2 mb-3"><MailPlus className="w-4 h-4 text-gray-400" /> Request access</div>
                    {selectedDirectoryClassroom.accessRequestStatus === "pending" ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">Your request is pending review.</div>
                    ) : (
                      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); requestClassroomAccessMutation.mutate({ classroomId: selectedDirectoryClassroom.id, message: accessRequestMessage || undefined }); }}>
                        <textarea value={accessRequestMessage} onChange={(e) => setAccessRequestMessage(e.target.value)} rows={3} placeholder="Short note for the owner…" className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400 transition-colors" />
                        <button type="submit" disabled={requestClassroomAccessMutation.isPending} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                          {requestClassroomAccessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailPlus className="w-4 h-4" />}
                          Request access
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Active classroom management */
            <div className="space-y-6">
              {/* Classroom Actions Bar */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{selectedDirectoryClassroom.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {selectedDirectoryClassroom.gradeLabel} · {selectedDirectoryClassroom.subject ?? "General"}
                      {classroomAccessLevel === "owner" ? " · Owner" : " · Collaborator"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => createClassSurveyMutation.mutate(selectedDirectoryClassroom.id)}
                      disabled={createClassSurveyMutation.isPending}
                      className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
                    >
                      {createClassSurveyMutation.isPending ? "Creating…" : "Create survey"}
                    </button>
                    <Link href="/dashboard/learning/reports" className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50">
                      Reports <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Pending access requests (owner only) */}
              {classroomAccessLevel === "owner" && pendingAccessRequests.length > 0 && (
                <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending access requests</h3>
                  <div className="space-y-2">
                    {pendingAccessRequests.map((request) => (
                      <div key={request.id} className="bg-white rounded-xl border border-amber-100 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">{request.requester.name}</div>
                          <div className="text-gray-500 text-xs">{request.requester.email}</div>
                          {request.message && <div className="text-gray-600 mt-1">{request.message}</div>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button type="button" onClick={() => respondToRequestMutation.mutate({ classroomId: selectedDirectoryClassroom.id, requestId: request.id, decision: "rejected" })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">Decline</button>
                          <button type="button" onClick={() => respondToRequestMutation.mutate({ classroomId: selectedDirectoryClassroom.id, requestId: request.id, decision: "approved" })} className="px-3 py-1.5 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 transition-colors">Approve</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collaborator management (owner only) */}
              {classroomAccessLevel === "owner" && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Collaborators</h3>
                  </div>
                  <form
                    className="flex gap-2 mb-4"
                    onSubmit={(e) => { e.preventDefault(); grantCollaboratorMutation.mutate({ classroomId: selectedDirectoryClassroom.id, email: collaboratorInviteEmail }); }}
                  >
                    <input
                      value={collaboratorInviteEmail}
                      onChange={(e) => setCollaboratorInviteEmail(e.target.value)}
                      placeholder="teacher@school.org"
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400 transition-colors"
                    />
                    <button type="submit" disabled={grantCollaboratorMutation.isPending} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors flex-shrink-0">
                      {grantCollaboratorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailPlus className="w-4 h-4" />}
                      Add
                    </button>
                  </form>
                  {collaborators.length > 0 && (
                    <div className="space-y-2">
                      {collaborators.map((collaborator) => (
                        <div key={collaborator.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
                          <div className="text-sm min-w-0">
                            <div className="font-medium text-gray-900 truncate">{collaborator.name}</div>
                            <div className="text-xs text-gray-500">{collaborator.email} · {collaborator.accessLevel === "owner" ? "Owner" : `Since ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(collaborator.grantedAt))}`}</div>
                          </div>
                          {collaborator.accessLevel === "collaborator" && (
                            <button type="button" onClick={() => revokeCollaboratorMutation.mutate({ classroomId: selectedDirectoryClassroom.id, teacherUserId: collaborator.teacherUserId })} className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors flex-shrink-0">
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Students & Topics — two column grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Students */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Students</h3>
                    {canManageStudents && (
                      <button type="button" onClick={() => setIsInviteModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Invite
                      </button>
                    )}
                  </div>
                  {!canManageStudents && <p className="text-xs text-gray-500 mb-3">Only the owner can manage the roster.</p>}
                  <div className="space-y-2">
                    {students.length ? students.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => setSelectedStudentId(student.id)}
                        className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${selectedStudent?.id === student.id ? "border-gray-300 bg-gray-50" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{student.fullName}</div>
                            <div className="text-xs text-gray-500 truncate">{student.email}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-[11px] text-gray-400">{student.inviteStatus}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">{student.onboardingStatus}</div>
                          </div>
                        </div>
                      </button>
                    )) : (
                      <div className="rounded-xl bg-gray-50 p-8 text-center">
                        <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No students yet</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Topics */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Topics</h3>
                    <div className="flex items-center gap-2">
                      {selectedTopic && (
                        <button type="button" onClick={() => updateTopicStatusMutation.mutate({ topicId: selectedTopic.id, status: selectedTopic.status === "active" ? "paused" : "active" })} className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
                          {selectedTopic.status === "active" ? "Pause" : "Activate"}
                        </button>
                      )}
                      <button type="button" onClick={() => setIsTopicModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> New topic
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {topics.length ? topics.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => setSelectedTopicId(topic.id)}
                        className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${selectedTopic?.id === topic.id ? "border-gray-300 bg-gray-50" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{topic.title}</div>
                            <div className="text-xs text-gray-500">{topic.subjectLabel ?? topic.subject ?? "General"} · {topic.status}</div>
                          </div>
                          <ArrowUpRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </div>
                      </button>
                    )) : (
                      <div className="rounded-xl bg-gray-50 p-8 text-center">
                        <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No topics yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Surveys */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Active Surveys</h3>
                {assignedSurveysQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                ) : selectedStudentAssignedSurveyStates.length ? (
                  <div className="space-y-2">
                    {selectedStudentAssignedSurveyStates.map((survey) => (
                      <div key={survey.id} className="rounded-xl bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{survey.title}</div>
                            <div className="mt-1 text-xs text-gray-500">{survey.completedCount}/{survey.assignedCount} done — {survey.completionRate}%</div>
                          </div>
                          <span className="rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-600">{survey.inProgressCount} active</span>
                        </div>
                        {survey.selectedStudentState && (
                          <div className="mt-2 text-xs text-gray-500">
                            {selectedStudent?.fullName}: {survey.selectedStudentState.responseStatus.replace("_", " ")}
                            {survey.selectedStudentState.completedAt ? ` · ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(survey.selectedStudentState.completedAt))}` : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">No active surveys for this class.</div>
                )}
              </div>

              {/* Course Hub — Topic Details */}
              {selectedTopic ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedTopic.title}</h2>
                      <p className="text-sm text-gray-500 mt-0.5">Upload materials, check grounding, and review student progress.</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {selectedTopic.subjectLabel ?? selectedTopic.subject ?? "General"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Left — Upload & Status */}
                    <div className="space-y-6">
                      <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <UploadCloud className="w-4 h-4 text-gray-400" /> Source Material
                        </h3>
                        <form className="space-y-3" onSubmit={(e) => {
                          e.preventDefault();
                          if (!materialFile) { toast.error("Choose a file first."); return; }
                          uploadMaterialMutation.mutate({ topicId: selectedTopic.id, file: materialFile, title: materialTitle || undefined, description: materialDescription || undefined });
                        }}>
                          <input value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} placeholder="Material name (e.g. Chapter 1)" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 transition-colors" />
                          <textarea value={materialDescription} onChange={(e) => setMaterialDescription(e.target.value)} rows={2} placeholder="Brief description…" className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 transition-colors" />
                          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center transition-colors hover:border-gray-300 hover:bg-gray-100/50">
                            <UploadCloud className="w-6 h-6 text-gray-400 mb-2" />
                            <div className="text-sm font-medium text-gray-700">{materialFile ? materialFile.name : "Select file"}</div>
                            <div className="text-xs text-gray-400 mt-1">PDF, TXT, DOC — max 20MB</div>
                            <input type="file" accept=".pdf,.txt,.md,.doc,.docx" className="hidden" onChange={(e) => setMaterialFile(e.target.files?.[0] ?? null)} />
                          </label>
                          <button type="submit" disabled={uploadMaterialMutation.isPending || !materialFile} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
                            {uploadMaterialMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                            Upload & Index
                          </button>
                        </form>
                      </div>

                      <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" /> Status
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-gray-50 p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Grounding</div>
                            <div className="text-sm font-semibold text-gray-900">{readinessQuery.data?.data.ready ? "Ready" : "Needed"}</div>
                            <div className="text-xs text-gray-500 mt-1">{readinessQuery.data?.data.summary ?? "Upload material first."}</div>
                          </div>
                          <div className="rounded-xl bg-gray-50 p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Data</div>
                            <div className="text-sm font-semibold text-gray-900">{materialsQuery.data?.data.length ?? 0} files</div>
                            <div className="text-xs text-gray-500 mt-1">{reports[0] ? `${reports[0].masteryPercent}% avg mastery` : "No insights yet."}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right — Insights & Interventions */}
                    <div className="space-y-6">
                      <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" /> Student Insights
                        </h3>
                        {selectedStudent ? (
                          <div className="space-y-3">
                            <div className="rounded-xl bg-gray-50 p-4">
                              <div className="text-sm font-medium text-gray-900">{selectedStudent.fullName}</div>
                              <div className="text-xs text-gray-500 mt-1">{patternSummary ?? "Learning patterns appear after more activity."}</div>
                            </div>
                            {selectedStudentReport && (
                              <div className="rounded-xl bg-gray-50 p-4">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Performance</div>
                                <div className="text-sm font-semibold text-gray-900">{selectedStudentReport.masteryPercent}% mastery</div>
                                <div className="text-xs text-gray-500 mt-1">{selectedStudentReport.report.studentSummary}</div>
                              </div>
                            )}
                            <div className="rounded-xl bg-gray-50 p-4">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Questions</div>
                              <div className="text-xs text-gray-500 italic">{questions.find((q) => q.student.id === selectedStudent.id)?.content ?? "No questions yet."}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-gray-50 p-8 text-center">
                            <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Select a student to view insights.</p>
                          </div>
                        )}
                      </div>

                      <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-gray-400" /> Support Actions
                          </h3>
                          {selectedStudent && (
                            <button type="button" onClick={() => setIsInterventionModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                              <Plus className="w-3.5 h-3.5" /> Log
                            </button>
                          )}
                        </div>
                        {selectedStudent ? (
                          <div className="space-y-2">
                            {interventionsQuery.isLoading ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                            ) : interventions.length ? (
                              interventions.map((intervention) => (
                                <div key={intervention.id} className="rounded-xl bg-gray-50 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">{intervention.title}</div>
                                      <div className="text-xs text-gray-500 mt-1">
                                        {formatInterventionTypeLabel(intervention.interventionType)} · {intervention.priority}
                                        {intervention.dueAt ? ` · due ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(intervention.dueAt))}` : ""}
                                      </div>
                                    </div>
                                    <span className="rounded-md bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{formatInterventionStatusLabel(intervention.status)}</span>
                                  </div>
                                  {intervention.notes && <div className="mt-2 text-xs text-gray-600">{intervention.notes}</div>}
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {intervention.status !== "in_progress" && (
                                      <button type="button" onClick={() => updateInterventionMutation.mutate({ interventionId: intervention.id, status: "in_progress", notes: intervention.notes ?? undefined, dueAt: intervention.dueAt ?? undefined })} className="px-2.5 py-1 rounded-md border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">Start</button>
                                    )}
                                    {intervention.status !== "completed" && (
                                      <button type="button" onClick={() => updateInterventionMutation.mutate({ interventionId: intervention.id, status: "completed", notes: intervention.notes ?? undefined, dueAt: intervention.dueAt ?? undefined })} className="px-2.5 py-1 rounded-md border border-emerald-200 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">Complete</button>
                                    )}
                                    {intervention.status !== "dismissed" && (
                                      <button type="button" onClick={() => updateInterventionMutation.mutate({ interventionId: intervention.id, status: "dismissed", notes: intervention.notes ?? undefined, dueAt: intervention.dueAt ?? undefined })} className="px-2.5 py-1 rounded-md border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors">Dismiss</button>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">No interventions recorded yet.</div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">Select a student to plan actions.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a topic</h3>
                  <p className="text-gray-500 max-w-sm mx-auto">Choose a topic to manage source materials and review student progress.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
