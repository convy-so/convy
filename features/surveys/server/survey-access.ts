import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import type { AuthSessionWithUser } from "@/features/auth/public-server";

export type SurveyAccessLevel = "owner" | "none";

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
  ownerId: string;
  accessLevel: SurveyAccessLevel;
  isSurveyCreator: boolean;
  isSurveyEditor: boolean;
  canDiscover: boolean;
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
};

export type SurveyPermissionCapability =
  | "canDiscover"
  | "canView"
  | "canComment"
  | "canEdit"
  | "canPublish"
  | "canDelete";

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
    ownerId: survey.userId,
    accessLevel,
    isSurveyCreator,
    isSurveyEditor: isSurveyCreator,
    canDiscover: isSurveyCreator,
    canView: isSurveyCreator,
    canComment: isSurveyCreator,
    canEdit: isSurveyCreator,
    canPublish: isSurveyCreator,
    canDelete: isSurveyCreator,
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

export function getSurveyEditors(): string[] {
  return [];
}

export async function isSurveyEditor(
  userId: string,
  surveyId: string,
): Promise<boolean> {
  const permission = await getSurveyPermissionContext(userId, surveyId);
  return Boolean(permission?.canEdit);
}
