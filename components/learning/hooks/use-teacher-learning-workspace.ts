"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { useServerEventStream } from "@/components/hooks/use-server-event-stream";
import { updateTopicStatusAction } from "@/app/actions/classroom";
import {
  resendStudentInvitationAction,
  cancelStudentInvitationAction,
} from "@/app/actions/classroom/student-actions";
import {
  fetchClassroomStudents,
  fetchClassroomTopics,
  fetchTopicMaterialUploadAttempts,
  fetchTeacherClassrooms,
  fetchTopicMaterials,
  fetchTopicReports,
  uploadTopicMaterial,
  ApiClientError,
} from "@/lib/api/learning";
import type { ClassroomStudent, PendingInvitation, Topic } from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import { getFriendlyActionError } from "@/lib/action-ux";
import type { getTeacherLearningWorkspaceInitialData } from "@/lib/server/app-queries";

function retryTransientLearningApiFailure(failureCount: number, error: Error) {
  return (
    error instanceof ApiClientError &&
    error.code === "SERVICE_UNAVAILABLE" &&
    failureCount < 2
  );
}

export function useTeacherLearningWorkspace(
  initialData: Awaited<ReturnType<typeof getTeacherLearningWorkspaceInitialData>>,
  options: { activeTopicView?: "overview" | "reports" | "students" } = {},
) {
  const queryClient = useQueryClient();
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const classroomsQuery = useQuery({
    queryKey: queryKeys.learning.classrooms,
    queryFn: fetchTeacherClassrooms,
    initialData: initialData.initialClassrooms,
    staleTime: 30_000,
    retry: retryTransientLearningApiFailure,
  });

  const classrooms = useMemo(() => classroomsQuery.data?.data ?? [], [classroomsQuery.data]);
  const selectedDirectoryClassroom =
    classrooms.find((classroom) => classroom.id === selectedClassroomId) ?? null;
  const selectedAccessibleClassroomId = selectedDirectoryClassroom?.id ?? null;
  const canManageStudents = Boolean(selectedDirectoryClassroom);

  useServerEventStream({
    url:
      selectedAccessibleClassroomId
        ? `/api/learning/classrooms/${selectedAccessibleClassroomId}/events`
        : null,
    enabled: Boolean(selectedAccessibleClassroomId),
    event: "classroom_roster_updated",
    onEvent: (message) => {
      if (
        !selectedAccessibleClassroomId ||
        message.type !== "classroom_roster_updated"
      ) {
        return;
      }

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.students(selectedAccessibleClassroomId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.classrooms,
        }),
      ]);
    },
  });

  useServerEventStream({
    url: selectedAccessibleClassroomId
      ? `/api/learning/classrooms/${selectedAccessibleClassroomId}/events`
      : null,
    enabled: Boolean(selectedAccessibleClassroomId),
    event: "learning_material_upload_updated",
    onEvent: (message) => {
      if (
        !selectedAccessibleClassroomId ||
        message.type !== "learning_material_upload_updated"
      ) {
        return;
      }

      const topicId =
        typeof message.topicId === "string" ? message.topicId : selectedTopic?.id;
      if (!topicId) {
        return;
      }

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.materials(topicId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.materialUploadAttempts(topicId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.readiness(topicId),
        }),
      ]);
    },
  });

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
    retry: retryTransientLearningApiFailure,
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
    retry: retryTransientLearningApiFailure,
  });

  const students = useMemo(
    () => studentsQuery.data?.data.students ?? ([] as ClassroomStudent[]),
    [studentsQuery.data],
  );
  const pendingInvitations = useMemo(
    () => studentsQuery.data?.data.pendingInvitations ?? ([] as PendingInvitation[]),
    [studentsQuery.data],
  );
  const topics = useMemo(
    () => topicsQuery.data?.data ?? ([] as Topic[]),
    [topicsQuery.data],
  );
  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? null;

  const materialsQuery = useQuery({
    queryKey: selectedTopic ? queryKeys.learning.materials(selectedTopic.id) : ["learningMaterials", "idle"],
    queryFn: async () => {
      if (!selectedTopic) {
        throw new Error("Missing topic");
      }
      return fetchTopicMaterials(selectedTopic.id);
    },
    enabled: Boolean(selectedTopic),
    staleTime: 30_000,
    retry: retryTransientLearningApiFailure,
  });
  const materialUploadAttemptsQuery = useQuery({
    queryKey: selectedTopic
      ? queryKeys.learning.materialUploadAttempts(selectedTopic.id)
      : ["learningMaterialUploadAttempts", "idle"],
    queryFn: async () => {
      if (!selectedTopic) {
        throw new Error("Missing topic");
      }
      return fetchTopicMaterialUploadAttempts(selectedTopic.id);
    },
    enabled: Boolean(selectedTopic),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const attempts = query.state.data?.data ?? [];
      return attempts.some((attempt) =>
        attempt.status === "queued" || attempt.status === "processing"
      )
        ? 2_500
        : false;
    },
    retry: retryTransientLearningApiFailure,
  });
  const reportsQuery = useQuery({
    queryKey: selectedTopic ? queryKeys.learning.reports(selectedTopic.id) : ["learningReports", "idle"],
    queryFn: async () => {
      if (!selectedTopic) {
        throw new Error("Missing topic");
      }
      return fetchTopicReports(selectedTopic.id);
    },
    enabled: Boolean(selectedTopic) && options.activeTopicView === "reports",
    staleTime: 30_000,
    retry: retryTransientLearningApiFailure,
  });

  const uploadMaterialMutation = useMutation({
    mutationFn: uploadTopicMaterial,
    onSuccess: async (result) => {
      const failedCount = result.data.attempts.filter(
        (attempt) => attempt.status === "failed",
      ).length;
      const queuedCount = result.data.attempts.length - failedCount;
      if (queuedCount > 0) {
        toast.success(
          queuedCount === 1
            ? "Material queued for processing"
            : `${queuedCount} materials queued for processing`,
        );
      }
      if (failedCount > 0) {
        toast.error(
          failedCount === 1
            ? "One file could not be queued"
            : `${failedCount} files could not be queued`,
        );
      } else {
      }
      if (selectedTopic) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.learning.materials(selectedTopic.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.learning.materialUploadAttempts(selectedTopic.id) }),
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

  const resendInvitationMutation = useMutation({
    mutationFn: async (invitation: PendingInvitation) => {
      if (!selectedAccessibleClassroomId) throw new Error("No classroom selected");
      const result = await resendStudentInvitationAction({
        invitationId: invitation.id,
        classroomId: selectedAccessibleClassroomId,
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(`Invitation resent to ${data?.email ?? "student"}`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to resend invitation"),
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitation: PendingInvitation) => {
      if (!selectedAccessibleClassroomId) throw new Error("No classroom selected");
      const result = await cancelStudentInvitationAction({
        invitationId: invitation.id,
        classroomId: selectedAccessibleClassroomId,
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: async () => {
      toast.success("Invitation cancelled");
      if (selectedAccessibleClassroomId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.learning.students(selectedAccessibleClassroomId),
        });
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to cancel invitation"),
  });

  const reportsPayload = reportsQuery.data?.data ?? null;
  const reports = reportsPayload?.reports ?? [];

  return {
    classroomsQuery,
    classrooms,
    selectedDirectoryClassroom,
    selectedAccessibleClassroomId,
    canManageStudents,
    studentsQuery,
    topicsQuery,
    students,
    pendingInvitations,
    topics,
    selectedTopic,
    materialsQuery,
    materialUploadAttemptsQuery,
    reportsQuery,
    uploadMaterialMutation,
    updateTopicStatusMutation,
    resendInvitationMutation,
    cancelInvitationMutation,
    reportsPayload,
    reports,
    selectedClassroomId,
    setSelectedClassroomId,
    selectedTopicId,
    setSelectedTopicId,
  };
}
