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

  // Learning
  learning: {
    me: ["studentMe"] as const,
    myPatterns: ["learningMyPatterns"] as const,
    classrooms: ["learningClassrooms"] as const,
    classroomRequests: (classroomId: string) =>
      ["learningClassroomRequests", classroomId] as const,
    classroomCollaborators: (classroomId: string) =>
      ["learningClassroomCollaborators", classroomId] as const,
    assignedSurveys: (classroomId: string) =>
      ["learningAssignedSurveys", classroomId] as const,
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
    students: (classroomId: string) => ["learningStudents", classroomId] as const,
    lessons: (classroomId: string) => ["lessons", classroomId] as const,
    materials: (lessonId: string) => ["learningMaterials", lessonId] as const,
    materialUploadAttempts: (lessonId: string) =>
      ["learningMaterialUploadAttempts", lessonId] as const,
    activationState: (lessonId: string) =>
      ["learningActivationState", lessonId] as const,
    reports: (lessonId: string) => ["learningReports", lessonId] as const,
    questions: (lessonId: string) => ["learningQuestions", lessonId] as const,
    classroomStudentPatterns: (classroomStudentId: string) =>
      ["learningClassroomStudentPatterns", classroomStudentId] as const,
    classroomStudentOverview: (classroomStudentId: string) =>
      ["learningClassroomStudentOverview", classroomStudentId] as const,
    lessonOverview: (lessonId: string) =>
      ["lessonOverview", lessonId] as const,
    onboarding: ["learningOnboarding"] as const,
    tutoring: (lessonId: string, language?: string | null) =>
      ["learningTutoring", lessonId, language ?? null] as const,
  },
} as const;

