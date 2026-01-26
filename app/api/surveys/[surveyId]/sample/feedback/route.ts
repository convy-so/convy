import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { surveys, sampleConversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth"; // Access existing auth lib (better-auth)
import { headers } from "next/headers";
import { nanoid } from "nanoid";

export async function POST(
  req: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { feedback } = await req.json();
    const surveyId = params.surveyId;

    if (!feedback) {
       return new NextResponse("Feedback is required", { status: 400 });
    }

    // 1. Get current survey to check ownership + current count
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new NextResponse("Survey not found", { status: 404 });
    }
    
    if (survey.userId !== session.user.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    if (survey.sampleConversationCount >= 3) {
         return new NextResponse("Max sample conversations reached (3)", { status: 400 });
    }

    // 2. Save the feedback to the current sample conversation record (for history)
    // We assume the frontend feedback is for the conversation that just happened (sampleConversationCount)
    // Actually, we should probably find the most recent sample conversation for this survey
    // But for simplicity, we'll upsert or just update if we knew the ID. 
    // Since we don't have the conversation ID easily here without looking it up:
    
    // Better approach: Just save the improvementFeedback to the SURVEY table directly, 
    // as it applies to the NEXT conversation.
    
    // 3. Update Survey: Increment count AND update improvementFeedback
    const newFeedback = survey.improvementFeedback 
        ? `${survey.improvementFeedback}\n\n- ${feedback}`
        : `- ${feedback}`;

    const [updatedSurvey] = await db
      .update(surveys)
      .set({
        sampleConversationCount: survey.sampleConversationCount + 1,
        improvementFeedback: newFeedback
      })
      .where(eq(surveys.id, surveyId))
      .returning();

    return NextResponse.json({ success: true, survey: updatedSurvey });

  } catch (error) {
    console.error("[Sample Feedback] Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
