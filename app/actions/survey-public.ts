"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { surveys } from "@/db/schema";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Get survey by shareable link (public endpoint, no auth required)
 */
export async function getSurveyByLinkAction(
  shareableLink: string
): Promise<
  ActionResult<{
    id: string;
    title: string;
    status: string;
    currentParticipants: number;
    participantLimit: number;
  }>
> {
  try {
    const [survey] = await db
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        currentParticipants: surveys.currentParticipants,
        participantLimit: surveys.participantLimit,
      })
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.status !== "active") {
      return { success: false, error: "Survey is not active" };
    }

    if (survey.currentParticipants >= survey.participantLimit) {
      return { success: false, error: "Survey has reached participant limit" };
    }

    return { success: true, data: survey };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch survey" };
  }
}

