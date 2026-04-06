/**
 * Centralized query key factory for React Query
 * Provides type-safe, consistent query keys across the application
 */

export const queryKeys = {
  // Workspace-related queries
  workspaces: {
    all: ["workspaces"] as const,
    active: ["activeWorkspace"] as const,
    members: (workspaceId: string) =>
      ["workspaceMembers", workspaceId] as const,
    departments: (workspaceId: string) =>
      ["workspaceDepartments", workspaceId] as const,
    invitations: (workspaceId: string) =>
      ["workspaceInvitations", workspaceId] as const,
  },

  // Survey-related queries
  surveys: {
    all: (orgId?: string | null) => ["surveys", orgId] as const,
    detail: (surveyId: string) => ["survey", surveyId] as const,
    responses: (surveyId: string, page: number, status: string) =>
      ["surveyResponses", surveyId, page, status] as const,
    analytics: (surveyId: string) => ["analyticsSnapshot", surveyId] as const,
    extraction: (surveyId: string) => ["surveyExtraction", surveyId] as const,
  },

  // Project-related queries
  projects: {
    all: (orgId?: string | null) => ["projects", orgId] as const,
    detail: (projectId: string) => ["project", projectId] as const,
  },

  // Notifications
  notifications: {
    all: (orgId?: string | null) => ["notifications", orgId] as const,
  },

  // Learning
  learning: {
    me: ["learningMe"] as const,
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
      topicId?: string | null,
    ) =>
      [
        "learningInterventions",
        classroomId,
        classroomStudentId ?? null,
        topicId ?? null,
      ] as const,
    students: (classroomId: string) => ["learningStudents", classroomId] as const,
    topics: (classroomId: string) => ["learningTopics", classroomId] as const,
    materials: (topicId: string) => ["learningMaterials", topicId] as const,
    readiness: (topicId: string) => ["learningReadiness", topicId] as const,
    reports: (topicId: string) => ["learningReports", topicId] as const,
    questions: (topicId: string) => ["learningQuestions", topicId] as const,
    studentPatterns: (studentId: string) =>
      ["learningStudentPatterns", studentId] as const,
    studentOverview: (studentId: string) =>
      ["learningStudentOverview", studentId] as const,
    topicOverview: (topicId: string) =>
      ["learningTopicOverview", topicId] as const,
    onboarding: ["learningOnboarding"] as const,
    tutoring: (topicId: string, language?: string | null) =>
      ["learningTutoring", topicId, language ?? null] as const,
  },
} as const;
