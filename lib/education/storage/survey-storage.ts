import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";

export async function getSurveyById(surveyId: string) {
  const [survey] = await getDb()
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));
  return survey ?? null;
}

export async function getSurveyByShareableLink(shareableLink: string) {
  const [survey] = await getDb()
    .select()
    .from(surveys)
    .where(eq(surveys.shareableLink, shareableLink));
  return survey ?? null;
}
