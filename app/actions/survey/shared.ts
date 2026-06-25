"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  assertExists,
  assertPermission,
} from "@/shared/http/action-result";
import {
  invalidateDashboardCaches,
  type DashboardCacheSection,
} from "@/shared/infra/cache";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
  type SurveyPermissionCapability,
  type SurveyPermissionContext,
} from "@/features/surveys/public-server";

export type SurveyActionSession = Awaited<ReturnType<typeof getVerifiedSession>>;
export type SurveyRecord = typeof surveys.$inferSelect;

export async function requireSurveyActionSession(): Promise<SurveyActionSession> {
  return getVerifiedSession();
}

export async function requireSurveyRecord(surveyId: string): Promise<SurveyRecord> {
  const [survey] = await getDb()
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  assertExists(survey, "Survey");
  return survey;
}

export async function requireSurveyWithPermission(params: {
  session: SurveyActionSession;
  surveyId: string;
  capability: SurveyPermissionCapability;
  message: string;
}): Promise<{ survey: SurveyRecord; permission: SurveyPermissionContext }> {
  const survey = await requireSurveyRecord(params.surveyId);
  const permission = await getSurveyPermissionForSession(params.session, survey.id);

  assertPermission(hasSurveyPermission(permission, params.capability), params.message);

  return { survey, permission };
}

export async function invalidateSurveyCaches(
  userId: string,
  tags?: DashboardCacheSection[],
) {
  await invalidateDashboardCaches(userId, null, tags);
  revalidatePath("/", "layout");
}
