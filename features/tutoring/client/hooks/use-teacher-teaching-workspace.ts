"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { useServerEventStream } from "@/shared/realtime/use-server-event-stream";
import { updateLessonStatusAction } from "@/app/actions/classroom";
import {
  resendStudentInvitationAction,
  cancelStudentInvitationAction,
} from "@/app/actions/classroom/student-actions";
import {
  fetchClassroomStudents,
  fetchClassroomLessons,
  fetchLessonActivationState,
  fetchLessonMaterialUploadAttempts,
  fetchTeacherClassrooms,
  fetchLessonMaterials,
  fetchLessonReports,
  uploadLessonMaterial,
  ApiClientError,
} from "@/features/tutoring/public-client";
import type { ClassroomStudent, PendingInvitation, Lesson } from "@/features/tutoring/public-client";
import { queryKeys } from "@/shared/http/query-keys";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import type { getTeacherTeachingWorkspaceInitialData } from "@/shared/http/page-data";

function retryTransientLearningApiFailure(failureCount: number, error: Error) {
  return (
    error instanceof ApiClientError &&
    error.code === "SERVICE_UNAVAILABLE" &&
    failureCount < 2
  );
}

export function useTeacherTeachingWorkspace(
  initialData: Awaited<ReturnType<typeof getTeacherTeachingWorkspaceInitialData>>,
  options: { activeLessonView?: "overview" | "reports" | "students" } = {},
) {
  const queryClient = useQueryClient();
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

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
        ? `/api/classrooms/${selectedAccessibleClassroomId}/events`
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
      ? `/api/classrooms/${selectedAccessibleClassroomId}/events`
      : null,
    enabled: Boolean(selectedAccessibleClassroomId),
    event: "lesson_material_upload_updated",
    onEvent: (message) => {
      if (
        !selectedAccessibleClassroomId ||
        message.type !== "lesson_material_upload_updated"
      ) {
        return;
      }

      const lessonId =
        typeof message.lessonId === "string" ? message.lessonId : selectedLesson?.id;
      if (!lessonId) {
        return;
      }

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.materials(lessonId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.materialUploadAttempts(lessonId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.learning.activationState(lessonId),
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
  const lessonsQuery = useQuery<
    Awaited<ReturnType<typeof fetchClassroomLessons>>
  >({
    queryKey: selectedAccessibleClassroomId
      ? queryKeys.learning.lessons(selectedAccessibleClassroomId)
      : ["lessons", "idle"],
    queryFn: async () => {
      if (!selectedAccessibleClassroomId) {
        throw new Error("Missing classroom id");
      }
      return fetchClassroomLessons(selectedAccessibleClassroomId);
    },
    enabled: Boolean(selectedAccessibleClassroomId),
    initialData:
      initialData.initialLessons &&
      selectedAccessibleClassroomId ===
        (initialData.initialClassrooms.data[0]?.id ?? null)
        ? (initialData.initialLessons as Awaited<
            ReturnType<typeof fetchClassroomLessons>
          >)
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
  const lessons = useMemo(
    () => lessonsQuery.data?.data ?? ([] as Lesson[]),
    [lessonsQuery.data],
  );
  const selectedLesson =
    lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;

  const materialsQuery = useQuery({
    queryKey: selectedLesson ? queryKeys.learning.materials(selectedLesson.id) : ["learningMaterials", "idle"],
    queryFn: async () => {
      if (!selectedLesson) {
        throw new Error("Missing lesson");
      }
      return fetchLessonMaterials(selectedLesson.id);
    },
    enabled: Boolean(selectedLesson),
    staleTime: 30_000,
    retry: retryTransientLearningApiFailure,
  });
  const materialUploadAttemptsQuery = useQuery({
    queryKey: selectedLesson
      ? queryKeys.learning.materialUploadAttempts(selectedLesson.id)
      : ["learningMaterialUploadAttempts", "idle"],
    queryFn: async () => {
      if (!selectedLesson) {
        throw new Error("Missing lesson");
      }
      return fetchLessonMaterialUploadAttempts(selectedLesson.id);
    },
    enabled: Boolean(selectedLesson),
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
  const activationStateQuery = useQuery({
    queryKey: selectedLesson
      ? queryKeys.learning.activationState(selectedLesson.id)
      : ["learningActivationState", "idle"],
    queryFn: async () => {
      if (!selectedLesson) {
        throw new Error("Missing lesson");
      }
      return fetchLessonActivationState(selectedLesson.id);
    },
    enabled: Boolean(selectedLesson),
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.data?.data?.ready ? false : 5_000,
    retry: retryTransientLearningApiFailure,
  });
  const reportsQuery = useQuery({
    queryKey: selectedLesson ? queryKeys.learning.reports(selectedLesson.id) : ["learningReports", "idle"],
    queryFn: async () => {
      if (!selectedLesson) {
        throw new Error("Missing lesson");
      }
      return fetchLessonReports(selectedLesson.id);
    },
    enabled: Boolean(selectedLesson) && options.activeLessonView === "reports",
    staleTime: 30_000,
    retry: retryTransientLearningApiFailure,
  });

  const uploadMaterialMutation = useMutation({
    mutationFn: uploadLessonMaterial,
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
      if (selectedLesson) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.learning.materials(selectedLesson.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.learning.materialUploadAttempts(selectedLesson.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.learning.activationState(selectedLesson.id) }),
        ]);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to upload material"),
  });
  const updateLessonStatusMutation = useMutation({
    mutationFn: async ({
      lessonId,
      status,
    }: {
      lessonId: string;
      status: "draft" | "active" | "paused" | "archived";
    }) => {
      const result = await updateLessonStatusAction({ lessonId, status });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: async () => {
      toast.success("Lesson status updated");
      if (selectedAccessibleClassroomId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.learning.lessons(selectedAccessibleClassroomId) });
      }
      if (selectedLesson) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.learning.activationState(selectedLesson.id) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update lesson"),
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
  const activationState = activationStateQuery.data?.data ?? null;
  const isActivationStateLoading = activationStateQuery.isLoading;
  const isActivationStateError = activationStateQuery.isError;

  return {
    classroomsQuery,
    classrooms,
    selectedDirectoryClassroom,
    selectedAccessibleClassroomId,
    canManageStudents,
    studentsQuery,
    lessonsQuery,
    students,
    pendingInvitations,
    lessons,
    selectedLesson,
    materialsQuery,
    materialUploadAttemptsQuery,
    activationStateQuery,
    activationState,
    isActivationStateLoading,
    isActivationStateError,
    reportsQuery,
    uploadMaterialMutation,
    updateLessonStatusMutation,
    resendInvitationMutation,
    cancelInvitationMutation,
    reportsPayload,
    reports,
    selectedClassroomId,
    setSelectedClassroomId,
    selectedLessonId,
    setSelectedLessonId,
  };
}

