import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import type { AuthSessionWithUser } from "@/lib/auth";

export type SurveyAccessLevel = "owner" | "none";

export type WorkspaceRole = null;

export type WorkspaceCapability =
  | "manageWorkspace"
  | "manageMembers"
  | "manageDepartments"
  | "createTeachingContent"
  | "viewWorkspaceDirectory"
  | "viewClassDirectory"
  | "managePrivacy";

export type WorkspaceProfileSnapshot = null;

export async function getWorkspaceMembership() {
  return null;
}

export async function isWorkspaceMember(): Promise<boolean> {
  return false;
}

export async function getWorkspaceRole(): Promise<WorkspaceRole> {
  return null;
}

export async function isWorkspaceOwner(): Promise<boolean> {
  return false;
}

export async function getWorkspaceOwnerId(): Promise<string | null> {
  return null;
}

export async function getWorkspaceProfile(): Promise<WorkspaceProfileSnapshot> {
  return null;
}

export function getWorkspaceCapabilities(): Record<WorkspaceCapability, boolean> {
  return {
    manageWorkspace: false,
    manageMembers: false,
    manageDepartments: false,
    createTeachingContent: false,
    viewWorkspaceDirectory: false,
    viewClassDirectory: false,
    managePrivacy: false,
  };
}

export async function hasWorkspaceCapability(): Promise<boolean> {
  return false;
}

export async function getSurveyAccessLevel(
  userId: string,
  surveyId: string,
): Promise<SurveyAccessLevel> {
  const [survey] = await getDb()
    .select({
      userId: surveys.userId,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) return "none";
  return survey.userId === userId ? "owner" : "none";
}

export type SurveyPermissionContext = {
  surveyId: string;
  workspaceId: null;
  resourceScope: "personal";
  activeContextMatchesResource: true;
  collaborationAllowed: false;
  creatorId: string;
  accessLevel: SurveyAccessLevel;
  isWorkspaceMember: false;
  workspaceRole: null;
  isWorkspaceOwner: false;
  isSurveyCreator: boolean;
  isSurveyEditor: boolean;
  canDiscover: boolean;
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
  canManageCollaborators: false;
};

export type SurveyPermissionCapability =
  | "canDiscover"
  | "canView"
  | "canComment"
  | "canEdit"
  | "canPublish"
  | "canDelete"
  | "canManageCollaborators";

export async function getSurveyPermissionContext(
  userId: string,
  surveyId: string,
): Promise<SurveyPermissionContext | null> {
  const [survey] = await getDb()
    .select({
      id: surveys.id,
      userId: surveys.userId,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) return null;

  const isSurveyCreator = survey.userId === userId;
  const accessLevel: SurveyAccessLevel = isSurveyCreator ? "owner" : "none";

  return {
    surveyId: survey.id,
    workspaceId: null,
    resourceScope: "personal",
    activeContextMatchesResource: true,
    collaborationAllowed: false,
    creatorId: survey.userId,
    accessLevel,
    isWorkspaceMember: false,
    workspaceRole: null,
    isWorkspaceOwner: false,
    isSurveyCreator,
    isSurveyEditor: isSurveyCreator,
    canDiscover: isSurveyCreator,
    canView: isSurveyCreator,
    canComment: isSurveyCreator,
    canEdit: isSurveyCreator,
    canPublish: isSurveyCreator,
    canDelete: isSurveyCreator,
    canManageCollaborators: false,
  };
}

export async function getSurveyPermissionForSession(
  session: Pick<AuthSessionWithUser, "user">,
  surveyId: string,
): Promise<SurveyPermissionContext | null> {
  return getSurveyPermissionContext(session.user.id, surveyId);
}

export function hasSurveyPermission(
  permission: SurveyPermissionContext | null | undefined,
  capability: SurveyPermissionCapability,
): permission is SurveyPermissionContext {
  return Boolean(permission?.[capability]);
}

export async function getSurveyEditors(): Promise<string[]> {
  return [];
}

export async function isSurveyEditor(
  userId: string,
  surveyId: string,
): Promise<boolean> {
  const permission = await getSurveyPermissionContext(userId, surveyId);
  return Boolean(permission?.canEdit);
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  return null;
}
