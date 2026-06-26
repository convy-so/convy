import { parseResponse } from "./core";
import {
  classroomAssignedSurveysResponseSchema,
  classroomStudentsResponseSchema,
  classroomLessonsResponseSchema,
  lessonInterventionsResponseSchema,
  retryLessonMaterialUploadAttemptResponseSchema,
  teacherClassroomsResponseSchema,
  teacherPatternResponseSchema,
  lessonActivationStateResponseSchema,
  lessonMaterialUploadAttemptsResponseSchema,
  lessonMaterialsResponseSchema,
  lessonQuestionsResponseSchema,
  lessonReportsResponseSchema,
  uploadLessonMaterialResponseSchema,
} from "./schemas";

export async function fetchTeacherClassrooms() {
  return await parseResponse(
    await fetch("/api/classrooms", { credentials: "include" }),
    teacherClassroomsResponseSchema,
  );
}

export async function fetchClassroomStudents(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/classrooms/${classroomId}/students`, {
      credentials: "include",
    }),
    classroomStudentsResponseSchema,
  );
}

export async function fetchClassroomLessons(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/classrooms/${classroomId}/lessons`, {
      credentials: "include",
    }),
    classroomLessonsResponseSchema,
  );
}

export async function fetchLessonMaterials(lessonId: string) {
  return await parseResponse(
    await fetch(`/api/lessons/${lessonId}/materials`, {
      credentials: "include",
    }),
    lessonMaterialsResponseSchema,
  );
}

export async function fetchLessonMaterialUploadAttempts(lessonId: string) {
  return await parseResponse(
    await fetch(`/api/lessons/${lessonId}/material-upload-attempts`, {
      credentials: "include",
    }),
    lessonMaterialUploadAttemptsResponseSchema,
  );
}

export async function retryLessonMaterialUploadAttempt(input: {
  lessonId: string;
  attemptId: string;
}) {
  return await parseResponse(
    await fetch(
      `/api/lessons/${input.lessonId}/material-upload-attempts/${input.attemptId}/retry`,
      {
        method: "POST",
        credentials: "include",
      },
    ),
    retryLessonMaterialUploadAttemptResponseSchema,
  );
}

export async function fetchClassroomAssignedSurveys(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/classrooms/${classroomId}/assigned-surveys`, {
      credentials: "include",
    }),
    classroomAssignedSurveysResponseSchema,
  );
}

export async function fetchLessonInterventions(input: {
  classroomId: string;
  lessonId?: string;
  classroomStudentId?: string;
}) {
  const searchParams = new URLSearchParams({
    classroomId: input.classroomId,
  });

  if (input.lessonId) {
    searchParams.set("lessonId", input.lessonId);
  }

  if (input.classroomStudentId) {
    searchParams.set("classroomStudentId", input.classroomStudentId);
  }

  return await parseResponse(
    await fetch(`/api/interventions?${searchParams.toString()}`, {
      credentials: "include",
    }),
    lessonInterventionsResponseSchema,
  );
}

export async function uploadLessonMaterial(input: {
  lessonId: string;
  file?: File;
  files?: File[];
  title?: string;
  description?: string;
}) {
  const formData = new FormData();
  const files = input.files ?? (input.file ? [input.file] : []);
  for (const file of files) {
    formData.append("files", file);
  }
  if (input.title) formData.append("title", input.title);
  if (input.description) formData.append("description", input.description);

  return await parseResponse(
    await fetch(`/api/lessons/${input.lessonId}/materials`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }),
    uploadLessonMaterialResponseSchema,
  );
}

export async function fetchLessonActivationState(lessonId: string) {
  return await parseResponse(
    await fetch(`/api/lessons/${lessonId}/activation-state`, {
      credentials: "include",
    }),
    lessonActivationStateResponseSchema,
  );
}

export async function fetchLessonReports(lessonId: string) {
  return await parseResponse(
    await fetch(`/api/lessons/${lessonId}/reports`, {
      credentials: "include",
    }),
    lessonReportsResponseSchema,
  );
}

export async function fetchLessonQuestions(
  lessonId: string,
  classroomStudentId?: string,
) {
  const query = classroomStudentId
    ? `?classroomStudentId=${encodeURIComponent(classroomStudentId)}`
    : "";
  return await parseResponse(
    await fetch(`/api/lessons/${lessonId}/questions${query}`, {
      credentials: "include",
    }),
    lessonQuestionsResponseSchema,
  );
}

export async function fetchClassroomStudentPatterns(classroomStudentId: string) {
  return await parseResponse(
    await fetch(`/api/students/${classroomStudentId}/patterns`, {
      credentials: "include",
    }),
    teacherPatternResponseSchema,
  );
}

