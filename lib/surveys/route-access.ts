import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import type { AuthSessionWithUser } from "@/lib/auth";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
  type SurveyPermissionCapability,
} from "@/lib/survey-access";

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
