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
    invitations: (workspaceId: string) =>
      ["workspaceInvitations", workspaceId] as const,
  },

  // Survey-related queries
  surveys: {
    all: (
      orgId?: string | null,
      page?: number,
      pageSize?: number,
      search?: string,
      filter?: string,
    ) => ["surveys", orgId, page, pageSize, search, filter] as const,
    detail: (surveyId: string) => ["survey", surveyId] as const,
    responses: (surveyId: string, page: number, status: string) =>
      ["surveyResponses", surveyId, page, status] as const,
    analytics: (surveyId: string) => ["surveyAnalytics", surveyId] as const,
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
} as const;
