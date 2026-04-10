import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  members,
  surveyEditors,
  surveys,
  workspaceProfiles,
  type WorkspaceRole,
  type WorkspaceType,
} from "@/db/schema";
import type { AuthSessionWithUser } from "@/lib/auth";
import { getVerifiedSession } from "@/lib/auth/session";

export type SurveyAccessLevel = "owner" | "editor" | "none";

export type WorkspaceCapability =
  | "manageWorkspace"
  | "manageMembers"
  | "manageDepartments"
  | "createTeachingContent"
  | "viewWorkspaceDirectory"
  | "viewClassDirectory"
  | "managePrivacy";

export type WorkspaceProfileSnapshot = {
  organizationId: string;
  type: WorkspaceType;
  departmentsEnabled: boolean;
  staffRolesEnabled: boolean;
  privacyControlsEnabled: boolean;
};

export async function getWorkspaceMembership(
  userId: string,
  organizationId: string,
) {
  return (
    (await getDb().query.members.findFirst({
      where: and(
        eq(members.userId, userId),
        eq(members.organizationId, organizationId),
      ),
    })) ?? null
  );
}

export async function isWorkspaceMember(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  return Boolean(await getWorkspaceMembership(userId, organizationId));
}

export async function getWorkspaceRole(
  userId: string,
  organizationId: string,
): Promise<WorkspaceRole | null> {
  const membership = await getWorkspaceMembership(userId, organizationId);
  return (membership?.role as WorkspaceRole | undefined) ?? null;
}

export async function isWorkspaceOwner(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const role = await getWorkspaceRole(userId, organizationId);
  return role === "owner";
}

export async function getWorkspaceOwnerId(
  organizationId: string,
): Promise<string | null> {
  const [owner] = await getDb()
    .select({ userId: members.userId })
    .from(members)
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.role, "owner"),
      ),
    );

  return owner?.userId ?? null;
}

export async function getWorkspaceProfile(
  organizationId: string,
): Promise<WorkspaceProfileSnapshot | null> {
  const profile = await getDb().query.workspaceProfiles.findFirst({
    where: eq(workspaceProfiles.organizationId, organizationId),
  });

  return profile ?? null;
}

export function getWorkspaceCapabilities(params: {
  role: WorkspaceRole;
  profile: WorkspaceProfileSnapshot | null;
}): Record<WorkspaceCapability, boolean> {
  const { role, profile } = params;
  const isInstitutional = profile?.type === "institutional";

  return {
    manageWorkspace: role === "owner" || role === "admin",
    manageMembers: role === "owner" || role === "admin",
    manageDepartments:
      isInstitutional && (role === "owner" || role === "admin"),
    createTeachingContent:
      role === "owner" || role === "admin" || role === "teacher",
    viewWorkspaceDirectory:
      role === "owner" ||
      role === "admin" ||
      role === "teacher" ||
      role === "staff_viewer",
    viewClassDirectory:
      role === "owner" ||
      role === "admin" ||
      role === "teacher" ||
      role === "staff_viewer",
    managePrivacy:
      isInstitutional &&
      Boolean(profile?.privacyControlsEnabled) &&
      role === "owner",
  };
}

export async function hasWorkspaceCapability(
  userId: string,
  organizationId: string,
  capability: WorkspaceCapability,
): Promise<boolean> {
  const [role, profile] = await Promise.all([
    getWorkspaceRole(userId, organizationId),
    getWorkspaceProfile(organizationId),
  ]);

  if (!role) {
    return false;
  }

  return getWorkspaceCapabilities({ role, profile })[capability];
}

export async function getSurveyAccessLevel(
  userId: string,
  surveyId: string,
): Promise<SurveyAccessLevel> {
  const [survey] = await getDb()
    .select({
      userId: surveys.userId,
      organizationId: surveys.organizationId,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) return "none";

  if (survey.userId === userId) {
    return "owner";
  }

  const [editorRecord] = await getDb()
    .select({ userId: surveyEditors.userId })
    .from(surveyEditors)
    .where(
      and(
        eq(surveyEditors.surveyId, surveyId),
        eq(surveyEditors.userId, userId),
      ),
    );

  return editorRecord ? "editor" : "none";
}

export type SurveyPermissionContext = {
  surveyId: string;
  workspaceId: string | null;
  resourceScope: "personal" | "workspace";
  activeContextMatchesResource: boolean;
  collaborationAllowed: boolean;
  creatorId: string;
  accessLevel: SurveyAccessLevel;
  isWorkspaceMember: boolean;
  workspaceRole: WorkspaceRole | null;
  isWorkspaceOwner: boolean;
  isSurveyCreator: boolean;
  isSurveyEditor: boolean;
  canDiscover: boolean;
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
  canManageCollaborators: boolean;
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
  options?: {
    activeWorkspaceId?: string | null;
  },
): Promise<SurveyPermissionContext | null> {
  const [survey] = await getDb()
    .select({
      id: surveys.id,
      userId: surveys.userId,
      organizationId: surveys.organizationId,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) return null;

  const accessLevel = await getSurveyAccessLevel(userId, surveyId);
  const resourceScope = survey.organizationId ? "workspace" : "personal";
  const activeContextMatchesResource =
    options?.activeWorkspaceId === undefined
      ? true
      : survey.organizationId
        ? options.activeWorkspaceId === survey.organizationId
        : options.activeWorkspaceId == null;
  const isSurveyCreator = survey.userId === userId;
  const workspaceRole = survey.organizationId
    ? await getWorkspaceRole(userId, survey.organizationId)
    : null;
  const isMemberOfWorkspace = Boolean(workspaceRole);
  const isSurveyEditor = accessLevel === "owner" || accessLevel === "editor";

  return {
    surveyId: survey.id,
    workspaceId: survey.organizationId ?? null,
    resourceScope,
    activeContextMatchesResource,
    collaborationAllowed: Boolean(survey.organizationId),
    creatorId: survey.userId,
    accessLevel,
    isWorkspaceMember: isMemberOfWorkspace,
    workspaceRole,
    isWorkspaceOwner: workspaceRole === "owner",
    isSurveyCreator,
    isSurveyEditor,
    canDiscover: accessLevel !== "none",
    canView: accessLevel !== "none",
    canComment: isSurveyEditor,
    canEdit: isSurveyEditor,
    canPublish: isSurveyEditor,
    canDelete: isSurveyCreator || workspaceRole === "owner",
    canManageCollaborators:
      isSurveyCreator || workspaceRole === "owner" || workspaceRole === "admin",
  };
}

export async function getSurveyPermissionForSession(
  session: Pick<AuthSessionWithUser, "user" | "session">,
  surveyId: string,
): Promise<SurveyPermissionContext | null> {
  return getSurveyPermissionContext(session.user.id, surveyId, {
    activeWorkspaceId: session.session.activeOrganizationId ?? null,
  });
}

export function hasSurveyPermission(
  permission: SurveyPermissionContext | null | undefined,
  capability: SurveyPermissionCapability,
  options?: { requireActiveContext?: boolean },
): permission is SurveyPermissionContext {
  if (!permission || !permission[capability]) {
    return false;
  }

  if (options?.requireActiveContext === false) {
    return true;
  }

  return permission.activeContextMatchesResource;
}

export async function getSurveyEditors(
  surveyId: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: surveyEditors.userId })
    .from(surveyEditors)
    .where(eq(surveyEditors.surveyId, surveyId));

  return rows.map((row) => row.userId);
}

export async function isSurveyEditor(
  userId: string,
  surveyId: string,
): Promise<boolean> {
  const permission = await getSurveyPermissionContext(userId, surveyId);
  return Boolean(permission?.canEdit);
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  try {
    const session = await getVerifiedSession();
    return session.session.activeOrganizationId ?? null;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return null;
    }

    throw error;
  }
}
