import { eq } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";

export async function fetchSurveyByShareableLink(shareableLink: string) {
  return getDb().query.surveys.findFirst({
    where: eq(surveys.shareableLink, shareableLink),
  });
}

export type PublicSurveyError = { message: string; status: 403 | 404 };

export async function fetchActiveSurveyByShareableLink(
  shareableLink: string,
): Promise<{ survey: NonNullable<Awaited<ReturnType<typeof fetchSurveyByShareableLink>>> } | { error: PublicSurveyError }> {
  const survey = await fetchSurveyByShareableLink(shareableLink);
  if (!survey) return { error: { message: "Survey not found", status: 404 } };
  if (survey.status !== "active") return { error: { message: "Survey is not active", status: 403 } };
  return { survey };
}
