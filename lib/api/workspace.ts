/**
 * API functions for workspace-related data fetching
 * Note: Server actions already exist, we wrap them for React Query
 */

import {
  getUserWorkspaces,
  getActiveWorkspace,
  getWorkspaceMembers,
  getWorkspaceInvitations,
  getWorkspaceDepartments,
  getWorkspaceLocalizationSettingsAction,
} from '@/app/actions/workspace';

export async function fetchWorkspaces() {
  const result = await getUserWorkspaces();
  if (!result.success) throw new Error(result.error);
  return result.data || [];
}

export async function fetchActiveWorkspace() {
  const result = await getActiveWorkspace();
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export async function fetchWorkspaceMembers(workspaceId: string) {
  const result = await getWorkspaceMembers({ organizationId: workspaceId });
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export async function fetchWorkspaceInvitations(workspaceId: string) {
  const result = await getWorkspaceInvitations(workspaceId);
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export async function fetchWorkspaceDepartments(workspaceId: string) {
  const result = await getWorkspaceDepartments({ organizationId: workspaceId });
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export async function fetchWorkspaceLocalizationSettings(workspaceId: string) {
  const result = await getWorkspaceLocalizationSettingsAction({
    organizationId: workspaceId,
  });
  if (!result.success) throw new Error(result.error);
  return result.data;
}
