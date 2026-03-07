import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    if (survey.status !== "creating") {
      return new Response("Survey is not in creation mode", { status: 400 });
    }

    // Generate shareable link if not exists
    let shareableLink = survey.shareableLink;
    if (!shareableLink) {
      const linkId = nanoid(12);
      shareableLink = `${env.APP_BASE_URL}/s/${linkId}`;
    }

    // Update survey status to active
    const [updatedSurvey] = await db
      .update(surveys)
      .set({
        status: "active",
        shareableLink,
        confirmed: true,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, surveyId))
      .returning();

    return new Response(
      JSON.stringify({
        id: updatedSurvey.id,
        title: updatedSurvey.title,
        status: updatedSurvey.status,
        shareableLink: updatedSurvey.shareableLink,
        participantLimit: updatedSurvey.participantLimit,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error finalizing survey:", error);
    return new Response("Internal server error", { status: 500 });
  }
}