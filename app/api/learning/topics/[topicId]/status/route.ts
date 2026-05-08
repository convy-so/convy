import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { z } from "zod";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

import { getDb } from "@/db";
import { learningTopics } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getTeacherTopicAccess } from "@/lib/learning/access";

const schema = z.object({
  status: z.enum(["draft", "active", "paused", "archived"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const body = schema.parse(await request.json());
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    await getDb()
      .update(learningTopics)
      .set({
        status: body.status,
        updatedAt: new Date(),
      })
      .where(eq(learningTopics.id, topicId));

    return NextResponse.json({
      success: true,
      data: {
        id: topicId,
        status: body.status,
      },
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to update topic status", "/api/learning/topics/[topicId]/status");
  }
}
