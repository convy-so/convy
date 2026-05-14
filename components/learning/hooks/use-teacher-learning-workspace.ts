"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { useRouter } from "@/i18n/routing";
import {
  updateLearningInterventionAction,
  updateTopicStatusAction,
} from "@/app/actions/classroom";
import { createSurveyDraftAction } from "@/app/actions/survey";
import {
  fetchClassroomAssignedSurveys,
  fetchClassroomStudents,
  fetchClassroomTopics,
  fetchLearningInterventions,
  fetchStudentPatterns,
  fetchTeacherClassrooms,
  fetchTopicMaterials,
  fetchTopicQuestions,
  fetchTopicReadiness,
  fetchTopicReports,
  uploadTopicMaterial,
} from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import { getFriendlyActionError } from "@/lib/action-ux";
import type { getTeacherLearningWorkspaceInitialData } from "@/lib/server/app-queries";

export function useTeacherLearningWorkspace(
  initialData: Awaited<ReturnType<typeof getTeacherLearningWorkspaceInitialData>>,
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const classroomsQuery = useQuery({
    queryKey: queryKeys.learning.classrooms,
    queryFn: fetchTeacherClassrooms,
    initialData: initialData.initialClassrooms,
    staleTime: 30_000,
  });

  const classrooms = useMemo(() => classroomsQuery.data?.data ?? [], [classroomsQuery.data]);
  const selectedDirectoryClassroom =
    classrooms.find((classroom) => classroom.id === selectedClassroomId) ??
    classrooms[0] ??
    null;
  const selectedAccessibleClassroomId = selectedDirectoryClassroom?.id ?? null;
  const canManageStudents = Boolean(selectedDirectoryClassroom);

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
    initialData:
      initialData.initialStudents &&
      selectedAccessibleClassroomId ===
        (initialData.initialClassrooms.data[0]?.id ?? null)
        ? initialData.initialStudents
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialTopics &&
      selectedAccessibleClassroomId ===
        (initialData.initialClassrooms.data[0]?.id ?? null)
        ? initialData.initialTopics
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialMaterials &&
      selectedTopic?.id === (initialData.initialTopics?.data[0]?.id ?? null)
        ? initialData.initialMaterials
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialReadiness &&
      selectedTopic?.id === (initialData.initialTopics?.data[0]?.id ?? null)
        ? initialData.initialReadiness
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialReportsPayload &&
      selectedTopic?.id === (initialData.initialTopics?.data[0]?.id ?? null)
        ? initialData.initialReportsPayload
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialQuestions &&
      selectedTopic?.id === (initialData.initialTopics?.data[0]?.id ?? null)
        ? initialData.initialQuestions
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialStudentPatterns &&
      selectedStudent?.id === (initialData.initialStudents?.data[0]?.id ?? null)
        ? initialData.initialStudentPatterns
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialAssignedSurveys &&
      selectedAccessibleClassroomId ===
        (initialData.initialClassrooms.data[0]?.id ?? null)
        ? initialData.initialAssignedSurveys
        : undefined,
    staleTime: 30_000,
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
    initialData:
      initialData.initialInterventions &&
      selectedAccessibleClassroomId ===
        (initialData.initialClassrooms.data[0]?.id ?? null) &&
      selectedStudent?.id === (initialData.initialStudents?.data[0]?.id ?? null) &&
      (selectedTopic?.id ?? null) === (initialData.initialTopics?.data[0]?.id ?? null)
        ? initialData.initialInterventions
        : undefined,
    staleTime: 30_000,
  });

  const uploadMaterialMutation = useMutation({
    mutationFn: uploadTopicMaterial,
    onSuccess: async () => {
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
    mutationFn: async ({
      topicId,
      status,
    }: {
      topicId: string;
      status: "draft" | "active" | "paused" | "archived";
    }) => {
      const result = await updateTopicStatusAction({ topicId, status });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: async () => {
      toast.success("Topic status updated");
      if (selectedAccessibleClassroomId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.learning.topics(selectedAccessibleClassroomId) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update topic"),
  });
  const createClassSurveyMutation = useMutation({
    mutationFn: async (classroomId: string) => {
      const result = await createSurveyDraftAction({
        deliveryMode: "classroom_assigned",
        classroomId,
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: async (data) => {
      toast.success("Class-linked survey draft created");
      await queryClient.invalidateQueries({ queryKey: queryKeys.surveys.all(null) });
      router.push(`/dashboard/create?id=${encodeURIComponent(data.id)}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to create class-linked survey",
      ),
  });
  const updateInterventionMutation = useMutation({
    mutationFn: async (input: {
      interventionId: string;
      status: "planned" | "in_progress" | "completed" | "dismissed";
      notes?: string;
      dueAt?: string;
    }) => {
      const result = await updateLearningInterventionAction(input);
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
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
  const selectedStudentAssignedSurveyStates = assignedSurveys.map((survey) => ({
    ...survey,
    selectedStudentState:
      survey.students.find((student) => student.classroomStudentId === selectedStudent?.id) ??
      null,
  }));
  const patternSummary = studentPatternsQuery.data?.data.profiles[0]?.studentSummary ?? null;

  return {
    classroomsQuery,
    classrooms,
    selectedDirectoryClassroom,
    selectedAccessibleClassroomId,
    canManageStudents,
    studentsQuery,
    topicsQuery,
    students,
    topics,
    selectedStudent,
    selectedTopic,
    materialsQuery,
    readinessQuery,
    reportsQuery,
    questionsQuery,
    studentPatternsQuery,
    assignedSurveysQuery,
    interventionsQuery,
    uploadMaterialMutation,
    updateTopicStatusMutation,
    createClassSurveyMutation,
    updateInterventionMutation,
    reportsPayload,
    reports,
    questions,
    assignedSurveys,
    interventions,
    selectedStudentReport,
    selectedStudentAssignedSurveyStates,
    patternSummary,
    selectedClassroomId,
    setSelectedClassroomId,
    selectedTopicId,
    setSelectedTopicId,
    selectedStudentId,
    setSelectedStudentId,
  };
}
