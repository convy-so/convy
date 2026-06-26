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
import { queryKeys } from "@/shared/http/query-keys";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
type TeacherClassroomsResponse = Awaited<ReturnType<typeof fetchTeacherClassrooms>>;
type TeacherClassroom = TeacherClassroomsResponse["data"][number];

type ClassroomStudentsResponse = Awaited<ReturnType<typeof fetchClassroomStudents>>;
type ClassroomStudentRecord = ClassroomStudentsResponse["data"]["students"][number];
type PendingInvitationRecord =
  ClassroomStudentsResponse["data"]["pendingInvitations"][number];

type ClassroomLessonsResponse = Awaited<ReturnType<typeof fetchClassroomLessons>>;
type ClassroomLesson = ClassroomLessonsResponse["data"][number];

type LessonMaterialsResponse = Awaited<ReturnType<typeof fetchLessonMaterials>>;

type LessonMaterialUploadAttemptsResponse = Awaited<
  ReturnType<typeof fetchLessonMaterialUploadAttempts>
>;
type LessonMaterialUploadAttemptRecord =
  LessonMaterialUploadAttemptsResponse["data"][number];

type LessonActivationStateResponse = Awaited<
  ReturnType<typeof fetchLessonActivationState>
>;

type LessonReportsResponse = Awaited<ReturnType<typeof fetchLessonReports>>;

type TeacherTeachingWorkspaceInitialData = {
  initialClassrooms: TeacherClassroomsResponse;
  initialStudents?: ClassroomStudentsResponse;
  initialLessons?: ClassroomLessonsResponse;
};

function retryTransientTutoringApiFailure(failureCount: number, error: Error) {
  return (
    error instanceof ApiClientError &&
    error.code === "SERVICE_UNAVAILABLE" &&
    failureCount < 2
  );
}

export function useTeacherTeachingWorkspace(
  initialData: TeacherTeachingWorkspaceInitialData,
  options: { activeLessonView?: "overview" | "reports" | "students" } = {},
) {
  const queryClient = useQueryClient();
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  const classroomsQuery = useQuery<TeacherClassroomsResponse>({
    queryKey: queryKeys.tutoring.classrooms,
    queryFn: fetchTeacherClassrooms,
    initialData: initialData.initialClassrooms,
    staleTime: 30_000,
    retry: retryTransientTutoringApiFailure,
  });

  const classrooms = useMemo<TeacherClassroom[]>(
    () => classroomsQuery.data?.data ?? [],
    [classroomsQuery.data],
  );
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
          queryKey: queryKeys.tutoring.students(selectedAccessibleClassroomId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tutoring.classrooms,
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
          queryKey: queryKeys.tutoring.materials(lessonId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tutoring.materialUploadAttempts(lessonId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tutoring.activationState(lessonId),
        }),
      ]);
    },
  });

  const studentsQuery = useQuery<ClassroomStudentsResponse>({
    queryKey: selectedAccessibleClassroomId
      ? queryKeys.tutoring.students(selectedAccessibleClassroomId)
      : ["classroomStudents", "idle"],
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
    retry: retryTransientTutoringApiFailure,
  });
  const lessonsQuery = useQuery<ClassroomLessonsResponse>({
    queryKey: selectedAccessibleClassroomId
      ? queryKeys.tutoring.lessons(selectedAccessibleClassroomId)
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
    retry: retryTransientTutoringApiFailure,
  });

  const students = useMemo(
    (): ClassroomStudentRecord[] => studentsQuery.data?.data.students ?? [],
    [studentsQuery.data],
  );
  const pendingInvitations = useMemo(
    (): PendingInvitationRecord[] =>
      studentsQuery.data?.data.pendingInvitations ?? [],
    [studentsQuery.data],
  );
  const lessons = useMemo(
    (): ClassroomLesson[] => lessonsQuery.data?.data ?? [],
    [lessonsQuery.data],
  );
  const selectedLesson: ClassroomLesson | null =
    lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;

  const materialsQuery = useQuery<LessonMaterialsResponse>({
    queryKey: selectedLesson ? queryKeys.tutoring.materials(selectedLesson.id) : ["lessonMaterials", "idle"],
    queryFn: async () => {
      if (!selectedLesson) {
        throw new Error("Missing lesson");
      }
      return fetchLessonMaterials(selectedLesson.id);
    },
    enabled: Boolean(selectedLesson),
    staleTime: 30_000,
    retry: retryTransientTutoringApiFailure,
  });
  const materialUploadAttemptsQuery = useQuery<LessonMaterialUploadAttemptsResponse>({
    queryKey: selectedLesson
      ? queryKeys.tutoring.materialUploadAttempts(selectedLesson.id)
      : ["lessonMaterialUploadAttempts", "idle"],
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
    retry: retryTransientTutoringApiFailure,
  });
  const activationStateQuery = useQuery<LessonActivationStateResponse>({
    queryKey: selectedLesson
      ? queryKeys.tutoring.activationState(selectedLesson.id)
      : ["lessonActivationState", "idle"],
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
    retry: retryTransientTutoringApiFailure,
  });
  const reportsQuery = useQuery<LessonReportsResponse>({
    queryKey: selectedLesson ? queryKeys.tutoring.reports(selectedLesson.id) : ["lessonReports", "idle"],
    queryFn: async () => {
      if (!selectedLesson) {
        throw new Error("Missing lesson");
      }
      return fetchLessonReports(selectedLesson.id);
    },
    enabled: Boolean(selectedLesson) && options.activeLessonView === "reports",
    staleTime: 30_000,
    retry: retryTransientTutoringApiFailure,
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
          queryClient.invalidateQueries({ queryKey: queryKeys.tutoring.materials(selectedLesson.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.tutoring.materialUploadAttempts(selectedLesson.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.tutoring.activationState(selectedLesson.id) }),
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
        await queryClient.invalidateQueries({ queryKey: queryKeys.tutoring.lessons(selectedAccessibleClassroomId) });
      }
      if (selectedLesson) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.tutoring.activationState(selectedLesson.id) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update lesson"),
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (invitation: PendingInvitationRecord) => {
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
    mutationFn: async (invitation: PendingInvitationRecord) => {
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
          queryKey: queryKeys.tutoring.students(selectedAccessibleClassroomId),
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


