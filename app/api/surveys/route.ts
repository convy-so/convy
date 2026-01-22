
import { db } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();

    // Create a new survey draft
    const surveyId = nanoid();
    const now = new Date();

    const [survey] = await db
      .insert(surveys)
      .values({
        id: surveyId,
        userId: session.user.id,
        title: "Untitled Survey",
        status: "creating",
        language: "en",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(survey);
  } catch (error) {
    if (error instanceof Error) {
        if (
          error.message === "UNAUTHENTICATED" ||
          error.message === "EMAIL_NOT_VERIFIED"
        ) {
          return new NextResponse(error.message, { status: 401 });
        }
    }
    console.error("Error creating survey:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
