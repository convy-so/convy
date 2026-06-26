/**
 * Centralized query key factory for React Query
 * Provides type-safe, consistent query keys across the application
 */

export const queryKeys = {
  // Survey-related queries
  surveys: {
    all: (scopeId?: string | null) => ["surveys", scopeId] as const,
    detail: (surveyId: string) => ["survey", surveyId] as const,
    responses: (surveyId: string, page: number, status: string) =>
      ["surveyResponses", surveyId, page, status] as const,
    analytics: (surveyId: string) => ["analyticsSnapshot", surveyId] as const,
    extraction: (surveyId: string) => ["surveyExtraction", surveyId] as const,
  },

  // Folder-related queries
  folders: {
    all: (scopeId?: string | null) => ["folders", scopeId] as const,
    detail: (folderId: string) => ["folders", "detail", folderId] as const,
  },

  // Notifications
  notifications: {
    all: (scopeId?: string | null) => ["notifications", scopeId] as const,
  },

  // Tutoring
  tutoring: {
    me: ["studentMe"] as const,
    myPatterns: ["studentPatterns"] as const,
    classrooms: ["classrooms"] as const,
    classroomRequests: (classroomId: string) =>
      ["classroomRequests", classroomId] as const,
    classroomCollaborators: (classroomId: string) =>
      ["classroomCollaborators", classroomId] as const,
    assignedSurveys: (classroomId: string) =>
      ["assignedSurveys", classroomId] as const,
    interventions: (
      classroomId: string,
      classroomStudentId?: string | null,
      lessonId?: string | null,
    ) =>
      [
        "lessonInterventions",
        classroomId,
        classroomStudentId ?? null,
        lessonId ?? null,
      ] as const,
    students: (classroomId: string) => ["classroomStudents", classroomId] as const,
    lessons: (classroomId: string) => ["lessons", classroomId] as const,
    materials: (lessonId: string) => ["lessonMaterials", lessonId] as const,
    materialUploadAttempts: (lessonId: string) =>
      ["lessonMaterialUploadAttempts", lessonId] as const,
    activationState: (lessonId: string) =>
      ["lessonActivationState", lessonId] as const,
    reports: (lessonId: string) => ["lessonReports", lessonId] as const,
    questions: (lessonId: string) => ["lessonQuestions", lessonId] as const,
    classroomStudentPatterns: (classroomStudentId: string) =>
      ["classroomStudentPatterns", classroomStudentId] as const,
    classroomStudentOverview: (classroomStudentId: string) =>
      ["classroomStudentOverview", classroomStudentId] as const,
    lessonOverview: (lessonId: string) =>
      ["lessonOverview", lessonId] as const,
    onboarding: ["studentOnboarding"] as const,
    tutoring: (lessonId: string, language?: string | null) =>
      ["studentTutoring", lessonId, language ?? null] as const,
  },
} as const;

