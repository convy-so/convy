import { eq } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import type { AuthSessionWithUser } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
  type SurveyPermissionCapability,
} from "@/features/surveys/public-server";

export async function loadSurveyWithPermission(
  session: Pick<AuthSessionWithUser, "user">,
  surveyId: string,
  permissionKey: SurveyPermissionCapability,
) {
  const survey = await getDb().query.surveys.findFirst({ where: eq(surveys.id, surveyId) });
  if (!survey) return { error: { message: "Survey not found", status: 404 } } as const;

  const permission = await getSurveyPermissionForSession(session, surveyId);
  if (!hasSurveyPermission(permission, permissionKey)) {
    return { error: { message: "Unauthorized", status: 403 } } as const;
  }

  return { survey, permission } as const;
}
