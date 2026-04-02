"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Loader2,
  Lock,
  MailPlus,
  Sparkles,
  Unplug,
  UploadCloud,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import { GlassPanel } from "@/components/learning/glass-panel";
import { MetricTile } from "@/components/learning/metric-tile";
import { SectionHeading } from "@/components/learning/section-heading";
import { Link, useRouter } from "@/i18n/routing";
import {
  createClassroom,
  createTopic,
  fetchClassroomCollaborators,
  fetchClassroomAccessRequests,
  fetchClassroomStudents,
  fetchClassroomTopics,
  revokeClassroomCollaborator,
  fetchStudentPatterns,
  fetchTeacherClassrooms,
  fetchTopicMaterials,
  fetchTopicQuestions,
  fetchTopicReadiness,
  fetchTopicReports,
  inviteStudent,
  requestClassroomAccess,
  respondToClassroomAccessRequest,
  updateTopicStatus,
  uploadTopicMaterial,
} from "@/lib/api/learning";
import { createSurveyDraft } from "@/lib/api/surveys";
import {
  fetchActiveWorkspace,
  fetchWorkspaceDepartments,
} from "@/lib/api/workspace";
import { queryKeys } from "@/lib/query-keys";

function countReadyTopics(statuses: string[]) {
  return statuses.filter((status) => status === "active").length;
}

function parseOutcomes(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [titlePart, ...rest] = line.split("::");
      const title = titlePart?.trim() ?? "";
      const description = rest.join("::").trim();

      if (!title || !description) {
        throw new Error(`Outcome line ${index + 1} must follow "Title :: Description".`);
      }

      return { id: `outcome-${index + 1}`, title, description };
    });
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

export function TeacherWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [classroomForm, setClassroomForm] = useState({
    title: "",
    description: "",
    subject: "",
    gradeLabel: "",
    departmentId: "",
  });
  const [inviteForm, setInviteForm] = useState({ fullName: "", email: "" });
  const [topicForm, setTopicForm] = useState({ title: "", description: "", subjectLabel: "", outcomes: "" });
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

  const createClassroomMutation = useMutation({
    mutationFn: createClassroom,
    onSuccess: async () => {
      setClassroomForm({ title: "", description: "", subject: "", gradeLabel: "", departmentId: "" });
      toast.success("Classroom created");
      await queryClient.invalidateQueries({ queryKey: queryKeys.learning.classrooms });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create classroom"),
  });
  const inviteStudentMutation = useMutation({
    mutationFn: inviteStudent,
    onSuccess: async () => {
      setInviteForm({ fullName: "", email: "" });
      toast.success("Student invited");
      if (selectedAccessibleClassroomId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.learning.students(selectedAccessibleClassroomId) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to invite student"),
  });
  const createTopicMutation = useMutation({
    mutationFn: createTopic,
    onSuccess: async () => {
      setTopicForm({ title: "", description: "", subjectLabel: "", outcomes: "" });
      toast.success("Topic created");
      if (selectedAccessibleClassroomId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.learning.topics(selectedAccessibleClassroomId) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create topic"),
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

  const reports = reportsQuery.data?.data ?? [];
  const questions = questionsQuery.data?.data ?? [];
  const selectedStudentReport =
    reports.find((report) => report.student.id === selectedStudent?.id) ?? null;
  const pendingAccessRequests = accessRequestsQuery.data?.data ?? [];
  const collaborators = collaboratorsQuery.data?.data ?? [];
  const patternSummary = studentPatternsQuery.data?.data.profiles[0]?.studentSummary ?? null;

  if (activeWorkspaceQuery.isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  }

  if (!activeWorkspace) {
    return (
      <div className="mx-auto max-w-[1200px] px-2 pb-12">
        <GlassPanel className="p-8">
          <SectionHeading
            eyebrow="Workspace required"
            title="Classrooms and departments live inside a workspace."
            description="Use your personal account for private survey work. Create or join a workspace to run classrooms, invite teachers, and collaborate safely."
            action={<Link href="/dashboard/workspaces/new" className="inline-flex items-center rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Create workspace</Link>}
          />
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700"><Sparkles className="h-3.5 w-3.5" />Workspace learning</div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">Manage classrooms, departments, and AI teaching safely inside one institution workspace.</h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">Teachers can discover classrooms in the workspace directory, but only owners and approved collaborators can open the internals.</p>
            </div>
          </div>
          <GlassPanel className="grid gap-4 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Workspace snapshot</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTile label="Visible classrooms" value={String(classrooms.length)} helper="All classrooms in this workspace directory." />
              <MetricTile label="Accessible classrooms" value={String(classrooms.filter((classroom) => classroom.accessLevel !== "none").length)} helper="Classrooms you can actively open." />
              <MetricTile label="Students" value={String(students.length)} helper="Students in the selected classroom." />
              <MetricTile label="Topics" value={String(topics.length)} helper={`${countReadyTopics(topics.map((topic) => topic.status))} active right now.`} />
            </div>
          </GlassPanel>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <GlassPanel className="p-5">
            <SectionHeading eyebrow="Setup" title="Create a classroom" description="Create a teacher-owned classroom and optionally place it in a department." />
            <form className="mt-6 space-y-4" onSubmit={(event) => {
              event.preventDefault();
              createClassroomMutation.mutate({
                title: classroomForm.title,
                description: classroomForm.description || undefined,
                subject: classroomForm.subject || undefined,
                gradeLabel: classroomForm.gradeLabel,
                departmentId: classroomForm.departmentId || undefined,
              });
            }}>
              <input value={classroomForm.title} onChange={(event) => setClassroomForm((current) => ({ ...current, title: event.target.value }))} placeholder="Senior Physics Cohort" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
              <input value={classroomForm.gradeLabel} onChange={(event) => setClassroomForm((current) => ({ ...current, gradeLabel: event.target.value }))} placeholder="Grade / stage" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
              <input value={classroomForm.subject} onChange={(event) => setClassroomForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Core subject" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
              <select value={classroomForm.departmentId} onChange={(event) => setClassroomForm((current) => ({ ...current, departmentId: event.target.value }))} className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300">
                <option value="">No department</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
              <textarea value={classroomForm.description} onChange={(event) => setClassroomForm((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Short description" className="w-full resize-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
              <button type="submit" disabled={createClassroomMutation.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">{createClassroomMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}Create classroom</button>
            </form>
          </GlassPanel>

          <GlassPanel className="p-4">
            <div className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Workspace classrooms</div>
              <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Discover and request access</div>
            </div>
            <div className="space-y-3">
              {classrooms.length ? classrooms.map((classroom) => {
                const meta = accessMeta(classroom.accessLevel);
                const isActive = classroom.id === selectedDirectoryClassroom?.id;
                return (
                  <button key={classroom.id} type="button" onClick={() => { setSelectedClassroomId(classroom.id); setSelectedTopicId(null); setSelectedStudentId(null); }} className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${isActive ? "border-sky-300 bg-sky-50/80" : "border-white/70 bg-white/75 hover:border-slate-200 hover:bg-white"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="text-base font-semibold text-slate-950">{classroom.title}</div>
                        <div className="text-sm text-slate-600">{classroom.gradeLabel} · {classroom.subject ?? "General"}</div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {classroom.departmentName ? <span className="rounded-full border border-white/70 bg-white px-2.5 py-1">{classroom.departmentName}</span> : null}
                          <span className="rounded-full border border-white/70 bg-white px-2.5 py-1">{classroom.teacherName}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>{meta.label}</span>
                        {classroom.accessRequestStatus === "pending" ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Request pending</span> : null}
                        <ArrowUpRight className={`h-4 w-4 ${isActive ? "text-sky-700" : "text-slate-400"}`} />
                      </div>
                    </div>
                  </button>
                );
              }) : <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-sm text-slate-500">No classrooms yet.</div>}
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          {!selectedDirectoryClassroom ? (
            <GlassPanel className="p-6">
              <SectionHeading eyebrow="Classroom operations" title="Choose a classroom" description="Select a classroom from the workspace directory." />
            </GlassPanel>
          ) : !canCollaborate ? (
            <GlassPanel className="p-6">
              <SectionHeading eyebrow="Classroom access" title={selectedDirectoryClassroom.title} description="You can see this classroom exists because you share the workspace, but the roster, reports, and topic internals stay private until the owner grants access." />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[20px] border border-white/70 bg-white/75 p-5 text-sm text-slate-600">
                  <div className="flex items-center gap-2 text-slate-950"><Lock className="h-4 w-4 text-slate-600" /><h3 className="text-lg font-semibold tracking-tight">Directory details</h3></div>
                  <div className="mt-4 space-y-2">
                    <div>Owner: {selectedDirectoryClassroom.teacherName}</div>
                    <div>Grade: {selectedDirectoryClassroom.gradeLabel}</div>
                    <div>Department: {selectedDirectoryClassroom.departmentName ?? "Not assigned"}</div>
                    <div>Students: {selectedDirectoryClassroom.studentCount}</div>
                    <div>Topics: {selectedDirectoryClassroom.topicCount}</div>
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/70 bg-white/75 p-5">
                  <div className="flex items-center gap-2 text-slate-950"><MailPlus className="h-4 w-4 text-sky-700" /><h3 className="text-lg font-semibold tracking-tight">Request collaboration</h3></div>
                  {selectedDirectoryClassroom.accessRequestStatus === "pending" ? (
                    <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Your access request is pending review.</div>
                  ) : (
                    <form className="mt-4 space-y-3" onSubmit={(event) => {
                      event.preventDefault();
                      requestClassroomAccessMutation.mutate({ classroomId: selectedDirectoryClassroom.id, message: accessRequestMessage || undefined });
                    }}>
                      <textarea value={accessRequestMessage} onChange={(event) => setAccessRequestMessage(event.target.value)} rows={4} placeholder="Short note for the owner" className="w-full resize-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
                      <button type="submit" disabled={requestClassroomAccessMutation.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">{requestClassroomAccessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}Request access</button>
                    </form>
                  )}
                </div>
              </div>
            </GlassPanel>
          ) : (
            <>
              <GlassPanel className="p-6">
                <SectionHeading
                  eyebrow="Classroom operations"
                  title={selectedDirectoryClassroom.title}
                  description="Invite students, define topics, ground the tutor, and launch surveys that are assigned automatically to this class."
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          createClassSurveyMutation.mutate(selectedDirectoryClassroom.id)
                        }
                        disabled={createClassSurveyMutation.isPending}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:opacity-60"
                      >
                        {createClassSurveyMutation.isPending ? "Creating..." : "Create class survey"}
                      </button>
                      <Link href="/dashboard/learning/reports" className="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700">Open report center</Link>
                    </div>
                  }
                />
                {classroomAccessLevel === "owner" && pendingAccessRequests.length ? (
                  <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50/80 p-5">
                    <div className="text-sm font-semibold text-slate-950">Pending collaborator requests</div>
                    <div className="mt-4 space-y-3">
                      {pendingAccessRequests.map((request) => (
                        <div key={request.id} className="rounded-[18px] border border-white/70 bg-white/85 px-4 py-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm text-slate-600"><div className="font-semibold text-slate-950">{request.requester.name}</div><div className="text-xs">{request.requester.email}</div>{request.message ? <div className="mt-2">{request.message}</div> : null}</div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => respondToRequestMutation.mutate({ classroomId: selectedDirectoryClassroom.id, requestId: request.id, decision: "rejected" })} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700">Decline</button>
                              <button type="button" onClick={() => respondToRequestMutation.mutate({ classroomId: selectedDirectoryClassroom.id, requestId: request.id, decision: "approved" })} className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">Approve</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {classroomAccessLevel === "owner" && collaborators.length ? (
                  <div className="mt-6 rounded-[20px] border border-white/70 bg-white/75 p-5">
                    <div className="text-sm font-semibold text-slate-950">Current collaborators</div>
                    <div className="mt-4 space-y-3">
                      {collaborators.map((collaborator) => (
                        <div
                          key={collaborator.id}
                          className="flex flex-col gap-3 rounded-[18px] border border-white/70 bg-white/85 px-4 py-4 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="text-sm text-slate-600">
                            <div className="font-semibold text-slate-950">
                              {collaborator.name}
                            </div>
                            <div className="text-xs">{collaborator.email}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {collaborator.accessLevel === "owner"
                                ? "Classroom owner"
                                : `Collaborator since ${new Intl.DateTimeFormat(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  }).format(new Date(collaborator.grantedAt))}`}
                            </div>
                          </div>
                          {collaborator.accessLevel === "collaborator" ? (
                            <button
                              type="button"
                              onClick={() =>
                                revokeCollaboratorMutation.mutate({
                                  classroomId: selectedDirectoryClassroom.id,
                                  teacherUserId: collaborator.teacherUserId,
                                })
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              <Unplug className="h-3.5 w-3.5" />
                              Remove access
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </GlassPanel>

              <GlassPanel className="p-6">
                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="space-y-6">
                    <div className="rounded-[20px] border border-white/70 bg-white/70 p-5">
                      <div className="flex items-center gap-2 text-slate-950"><Users className="h-4 w-4 text-sky-700" /><h3 className="text-lg font-semibold tracking-tight">Students</h3></div>
                      {canManageStudents ? (
                        <form className="mt-4 space-y-3" onSubmit={(event) => {
                          event.preventDefault();
                          inviteStudentMutation.mutate({ classroomId: selectedDirectoryClassroom.id, ...inviteForm });
                        }}>
                          <input value={inviteForm.fullName} onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Student full name" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
                          <input value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="student@email.com" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
                          <button type="submit" disabled={inviteStudentMutation.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900">{inviteStudentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}Invite student</button>
                        </form>
                      ) : <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Only the classroom owner can change the roster.</div>}
                      <div className="mt-4 space-y-3">
                        {students.length ? students.map((student) => (
                          <button key={student.id} type="button" onClick={() => setSelectedStudentId(student.id)} className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${selectedStudent?.id === student.id ? "border-sky-300 bg-sky-50/80" : "border-white/70 bg-white/70 hover:border-slate-200"}`}>
                            <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-slate-950">{student.fullName}</div><div className="mt-1 text-xs text-slate-500">{student.email}</div></div><div className="text-right text-[11px] font-medium text-slate-500"><div>{student.inviteStatus}</div><div className="mt-1">{student.onboardingStatus}</div></div></div>
                          </button>
                        )) : <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">No students yet.</div>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-[20px] border border-white/70 bg-white/70 p-5">
                      <div className="flex items-center gap-2 text-slate-950"><BookOpen className="h-4 w-4 text-emerald-700" /><h3 className="text-lg font-semibold tracking-tight">Create topic and outcomes</h3></div>
                      <form className="mt-4 space-y-3" onSubmit={(event) => {
                        event.preventDefault();
                        const subjectLabel = topicForm.subjectLabel.trim() || "General";
                        const subjectKey = subjectLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "general";
                        createTopicMutation.mutate({
                          classroomId: selectedDirectoryClassroom.id,
                          title: topicForm.title,
                          description: topicForm.description,
                          subject: subjectLabel,
                          subjectKey,
                          subjectLabel,
                          learningOutcomes: parseOutcomes(topicForm.outcomes),
                          sourceBoundary: { groundingMode: "teacher_material_plus_web_opening", webOpeningEnabled: true, teacherSummary: topicForm.description },
                        });
                      }}>
                        <input value={topicForm.title} onChange={(event) => setTopicForm((current) => ({ ...current, title: event.target.value }))} placeholder="Topic title" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-emerald-300" />
                        <input value={topicForm.subjectLabel} onChange={(event) => setTopicForm((current) => ({ ...current, subjectLabel: event.target.value }))} placeholder="Subject label" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-emerald-300" />
                        <textarea value={topicForm.description} onChange={(event) => setTopicForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Topic description" className="w-full resize-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-emerald-300" />
                        <textarea value={topicForm.outcomes} onChange={(event) => setTopicForm((current) => ({ ...current, outcomes: event.target.value }))} rows={5} placeholder="Outcome :: Description" className="w-full resize-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-emerald-300" />
                        <button type="submit" disabled={createTopicMutation.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">{createTopicMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Create topic</button>
                      </form>
                    </div>

                    <div className="rounded-[20px] border border-white/70 bg-white/70 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div><div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Topics</div><div className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Classroom curriculum</div></div>
                        {selectedTopic ? <button type="button" onClick={() => updateTopicStatusMutation.mutate({ topicId: selectedTopic.id, status: selectedTopic.status === "active" ? "paused" : "active" })} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{selectedTopic.status === "active" ? "Pause" : "Activate"}</button> : null}
                      </div>
                      <div className="mt-4 space-y-3">
                        {topics.length ? topics.map((topic) => (
                          <button key={topic.id} type="button" onClick={() => setSelectedTopicId(topic.id)} className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${selectedTopic?.id === topic.id ? "border-emerald-300 bg-emerald-50/80" : "border-white/70 bg-white/70 hover:border-slate-200"}`}>
                            <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-950">{topic.title}</div><div className="mt-1 text-xs text-slate-500">{topic.subjectLabel ?? topic.subject ?? "General"} - {topic.status}</div></div><ArrowUpRight className="h-4 w-4 text-slate-400" /></div>
                          </button>
                        )) : <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">No topics yet.</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </GlassPanel>

              <GlassPanel className="p-6">
                <SectionHeading eyebrow="Selected topic" title={selectedTopic?.title ?? "Choose a topic"} description={selectedTopic ? "Upload source material, review grounding readiness, and inspect student signals." : "Once a topic is selected, this panel becomes the operational center for grounding and review."} action={selectedTopic ? <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{selectedTopic.subjectLabel ?? selectedTopic.subject ?? "General"}</div> : null} />
                {selectedTopic ? (
                  <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="space-y-6">
                      <div className="rounded-[20px] border border-white/70 bg-white/70 p-5">
                        <div className="flex items-center gap-2 text-slate-950"><UploadCloud className="h-4 w-4 text-sky-700" /><h3 className="text-lg font-semibold tracking-tight">Upload material</h3></div>
                        <form className="mt-4 space-y-3" onSubmit={(event) => {
                          event.preventDefault();
                          if (!materialFile) { toast.error("Add a file before uploading."); return; }
                          uploadMaterialMutation.mutate({ topicId: selectedTopic.id, file: materialFile, title: materialTitle || undefined, description: materialDescription || undefined });
                        }}>
                          <input value={materialTitle} onChange={(event) => setMaterialTitle(event.target.value)} placeholder="Material title" className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
                          <textarea value={materialDescription} onChange={(event) => setMaterialDescription(event.target.value)} rows={3} placeholder="Optional note" className="w-full resize-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-300" />
                          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-300 bg-white/75 px-4 py-6 text-center">
                            <UploadCloud className="h-5 w-5 text-sky-700" />
                            <div className="mt-3 text-sm font-medium text-slate-800">{materialFile ? materialFile.name : "Choose PDF or notes"}</div>
                            <input type="file" accept=".pdf,.txt,.md,.doc,.docx" className="hidden" onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)} />
                          </label>
                          <button type="submit" disabled={uploadMaterialMutation.isPending || !materialFile} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">{uploadMaterialMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}Upload and index</button>
                        </form>
                      </div>

                      <div className="rounded-[20px] border border-white/70 bg-white/70 p-5">
                        <div className="flex items-center gap-2 text-slate-950"><FileText className="h-4 w-4 text-emerald-700" /><h3 className="text-lg font-semibold tracking-tight">Readiness and reports</h3></div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="rounded-[18px] border border-white/70 bg-white/75 p-4"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Grounding readiness</div><div className="mt-2 text-sm font-semibold text-slate-950">{readinessQuery.data?.data.ready ? "Ready to publish" : "Needs more grounding"}</div><div className="mt-2 text-sm text-slate-600">{readinessQuery.data?.data.summary ?? "Readiness appears after processing."}</div></div>
                          <div className="rounded-[18px] border border-white/70 bg-white/75 p-4"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Indexed materials</div><div className="mt-2 text-sm font-semibold text-slate-950">{materialsQuery.data?.data.length ?? 0} files</div><div className="mt-2 text-sm text-slate-600">{reports[0] ? `${reports[0].masteryPercent}% mastery in latest report` : "No report yet."}</div></div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-[20px] border border-white/70 bg-white/70 p-5">
                        <div className="flex items-center gap-2 text-slate-950"><Users className="h-4 w-4 text-sky-700" /><h3 className="text-lg font-semibold tracking-tight">Student snapshot</h3></div>
                        {selectedStudent ? (
                          <div className="mt-4 space-y-4">
                            <div className="rounded-[18px] border border-white/70 bg-white/75 px-4 py-4"><div className="text-sm font-semibold text-slate-950">{selectedStudent.fullName}</div><div className="mt-2 text-sm text-slate-600">{patternSummary ?? "Learning pattern memory is still warming up for this student."}</div></div>
                            {selectedStudentReport ? <div className="rounded-[18px] border border-white/70 bg-white/75 px-4 py-4"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Latest mastery</div><div className="mt-2 text-sm font-semibold text-slate-950">{selectedStudentReport.masteryPercent}% mastery</div><div className="mt-2 text-sm text-slate-600">{selectedStudentReport.report.studentSummary}</div></div> : null}
                            <div className="rounded-[18px] border border-white/70 bg-white/75 px-4 py-4"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent question signal</div><div className="mt-2 text-sm text-slate-600">{questions.find((question) => question.student.id === selectedStudent.id)?.content ?? "No extra student questions recorded for this topic yet."}</div></div>
                          </div>
                        ) : <div className="mt-4 rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm text-slate-500">Select a student to inspect learning signals.</div>}
                      </div>
                    </div>
                  </div>
                ) : <div className="mt-6 rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-10 text-sm text-slate-500">Choose a topic to upload materials and inspect report signals.</div>}
              </GlassPanel>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
