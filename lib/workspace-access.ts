// "use server";

import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { members, surveyEditors, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import type { AuthSessionWithUser } from "@/lib/auth";

/**
 * Check if a user is a member of a workspace
 */
export async function isWorkspaceMember(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const [member] = await getDb()
    .select()
    .from(members)
    .where(
      and(
        eq(members.userId, userId),
        eq(members.organizationId, organizationId),
      ),
    );
  return !!member;
}

/**
 * Check if a user is the owner of a workspace
 */
export async function isWorkspaceOwner(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const [member] = await getDb()
    .select()
    .from(members)
    .where(
      and(
        eq(members.userId, userId),
        eq(members.organizationId, organizationId),
        eq(members.role, "owner"),
      ),
    );
  return !!member;
}

/**
 * Get the owner's user ID for a workspace
 * Useful for billing lookups since subscriptions are tied to the owner
 */
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

/**
 * Determine a user's survey-scoped access level.
 * - "owner": the survey creator
 * - "editor": an explicitly granted survey editor
 * - "discoverer": any other workspace member who may discover the survey exists
 * - "none": no access
 */
export async function getSurveyAccessLevel(
  userId: string,
  surveyId: string,
): Promise<"owner" | "editor" | "discoverer" | "none"> {
  const [survey] = await getDb()
    .select({
      userId: surveys.userId,
      organizationId: surveys.organizationId,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) return "none";

  // Case 1: Survey belongs to a workspace
  if (survey.organizationId) {
    // Check if user is a member of this workspace
    const isMember = await isWorkspaceMember(userId, survey.organizationId);
    if (!isMember) return "none";

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

    if (editorRecord) {
      return "editor";
    }

    // Default for all other workspace members
    return "discoverer";
  }

  // Case 2: Personal Survey (no organization)
  if (survey.userId === userId) return "owner";

  return "none";
}

export type SurveyPermissionContext = {
  surveyId: string;
  workspaceId: string | null;
  resourceScope: "personal" | "workspace";
  activeContextMatchesResource: boolean;
  collaborationAllowed: boolean;
  creatorId: string;
  accessLevel: "owner" | "editor" | "discoverer" | "none";
  isWorkspaceMember: boolean;
  isWorkspaceOwner: boolean;
  isSurveyCreator: boolean;
  isSurveyEditor: boolean;
  canDiscover: boolean;
  canRequestAccess: boolean;
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
};

export type SurveyPermissionCapability =
  | "canDiscover"
  | "canRequestAccess"
  | "canView"
  | "canComment"
  | "canEdit"
  | "canPublish"
  | "canDelete";

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
  const isOwnerOfWorkspace = survey.organizationId
    ? await isWorkspaceOwner(userId, survey.organizationId)
    : false;
  const isMemberOfWorkspace = survey.organizationId
    ? await isWorkspaceMember(userId, survey.organizationId)
    : survey.userId === userId;
  const [editorRecord] = isSurveyCreator
    ? [{ userId }]
    : await getDb()
        .select({ userId: surveyEditors.userId })
        .from(surveyEditors)
        .where(
          and(
            eq(surveyEditors.surveyId, surveyId),
            eq(surveyEditors.userId, userId),
          ),
        );
  const isSurveyEditor = isSurveyCreator || Boolean(editorRecord);
  const canDiscover = accessLevel !== "none";
  // Discoverers can see that the survey exists, but they still need edit access
  // before they can open creation history, analytics, or collaboration surfaces.
  const canView = isSurveyCreator || accessLevel === "editor";
  const canEdit = canView;
  const canRequestAccess =
    Boolean(survey.organizationId) &&
    isMemberOfWorkspace &&
    !isSurveyCreator &&
    !isSurveyEditor;

  return {
    surveyId: survey.id,
    workspaceId: survey.organizationId ?? null,
    resourceScope,
    activeContextMatchesResource,
    collaborationAllowed: Boolean(survey.organizationId),
    creatorId: survey.userId,
    accessLevel,
    isWorkspaceMember: isMemberOfWorkspace,
    isWorkspaceOwner: isOwnerOfWorkspace,
    isSurveyCreator,
    isSurveyEditor,
    canDiscover,
    canRequestAccess,
    canView,
    canComment: canEdit,
    canEdit,
    canPublish: canEdit,
    canDelete:
      isSurveyCreator || (Boolean(survey.organizationId) && isOwnerOfWorkspace),
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

/**
 * Get the active workspace ID from the current session
 * Returns null if the user is in their personal account
 */
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

