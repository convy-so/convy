/**
 * Centralized query key factory for React Query
 * Provides type-safe, consistent query keys across the application
 */

export const queryKeys = {
  // Workspace-related queries
  workspaces: {
    all: ['workspaces'] as const,
    active: ['activeWorkspace'] as const,
    members: (workspaceId: string) => ['workspaceMembers', workspaceId] as const,
    invitations: (workspaceId: string) => ['workspaceInvitations', workspaceId] as const,
  },
  
  // Survey-related queries
  surveys: {
    all: ['surveys'] as const,
    detail: (surveyId: string) => ['survey', surveyId] as const,
    responses: (surveyId: string, page: number, status: string) => 
      ['surveyResponses', surveyId, page, status] as const,
    analytics: (surveyId: string) => ['surveyAnalytics', surveyId] as const,
    extraction: (surveyId: string) => ['surveyExtraction', surveyId] as const,
  },
  
  // Notifications
  notifications: {
    all: ['notifications'] as const,
  },
  
  // Integrations (already exist, documenting for reference)
  integrations: {
    slack: ['slack-integration'] as const,
    notion: ['notion-integration'] as const,
    zapier: ['zapier-integration'] as const,
  },
} as const;
