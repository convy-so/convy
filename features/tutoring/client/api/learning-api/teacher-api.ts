import { parseResponse } from "./core";
import {
  classroomAssignedSurveysResponseSchema,
  classroomStudentsResponseSchema,
  classroomTopicsResponseSchema,
  learningInterventionsResponseSchema,
  retryTopicMaterialUploadAttemptResponseSchema,
  teacherClassroomsResponseSchema,
  teacherPatternResponseSchema,
  topicActivationStateResponseSchema,
  topicMaterialUploadAttemptsResponseSchema,
  topicMaterialsResponseSchema,
  topicQuestionsResponseSchema,
  topicReportsResponseSchema,
  uploadTopicMaterialResponseSchema,
} from "./schemas";

export async function fetchTeacherClassrooms() {
  return await parseResponse(
    await fetch("/api/learning/classrooms", { credentials: "include" }),
    teacherClassroomsResponseSchema,
  );
}

export async function fetchClassroomStudents(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${classroomId}/students`, {
      credentials: "include",
    }),
    classroomStudentsResponseSchema,
  );
}

export async function fetchClassroomTopics(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${classroomId}/lessons`, {
      credentials: "include",
    }),
    classroomTopicsResponseSchema,
  );
}

export async function fetchTopicMaterials(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/lessons/${topicId}/materials`, {
      credentials: "include",
    }),
    topicMaterialsResponseSchema,
  );
}

export async function fetchTopicMaterialUploadAttempts(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/lessons/${topicId}/material-upload-attempts`, {
      credentials: "include",
    }),
    topicMaterialUploadAttemptsResponseSchema,
  );
}

export async function retryTopicMaterialUploadAttempt(input: {
  topicId: string;
  attemptId: string;
}) {
  return await parseResponse(
    await fetch(
      `/api/learning/lessons/${input.topicId}/material-upload-attempts/${input.attemptId}/retry`,
      {
        method: "POST",
        credentials: "include",
      },
    ),
    retryTopicMaterialUploadAttemptResponseSchema,
  );
}

export async function fetchClassroomAssignedSurveys(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${classroomId}/assigned-surveys`, {
      credentials: "include",
    }),
    classroomAssignedSurveysResponseSchema,
  );
}

export async function fetchLearningInterventions(input: {
  classroomId: string;
  topicId?: string;
  classroomStudentId?: string;
}) {
  const searchParams = new URLSearchParams({
    classroomId: input.classroomId,
  });

  if (input.topicId) {
    searchParams.set("topicId", input.topicId);
  }

  if (input.classroomStudentId) {
    searchParams.set("classroomStudentId", input.classroomStudentId);
  }

  return await parseResponse(
    await fetch(`/api/learning/interventions?${searchParams.toString()}`, {
      credentials: "include",
    }),
    learningInterventionsResponseSchema,
  );
}

export async function uploadTopicMaterial(input: {
  topicId: string;
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
    await fetch(`/api/learning/lessons/${input.topicId}/materials`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }),
    uploadTopicMaterialResponseSchema,
  );
}

export async function fetchTopicActivationState(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/lessons/${topicId}/activation-state`, {
      credentials: "include",
    }),
    topicActivationStateResponseSchema,
  );
}

export async function fetchTopicReports(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/lessons/${topicId}/reports`, {
      credentials: "include",
    }),
    topicReportsResponseSchema,
  );
}

export async function fetchTopicQuestions(
  topicId: string,
  classroomStudentId?: string,
) {
  const query = classroomStudentId
    ? `?classroomStudentId=${encodeURIComponent(classroomStudentId)}`
    : "";
  return await parseResponse(
    await fetch(`/api/learning/lessons/${topicId}/questions${query}`, {
      credentials: "include",
    }),
    topicQuestionsResponseSchema,
  );
}

export async function fetchClassroomStudentPatterns(classroomStudentId: string) {
  return await parseResponse(
    await fetch(`/api/learning/students/${classroomStudentId}/patterns`, {
      credentials: "include",
    }),
    teacherPatternResponseSchema,
  );
}
