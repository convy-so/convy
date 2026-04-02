import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { learningTopics } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update topic status" },
      { status: 400 },
    );
  }
}
