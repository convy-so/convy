import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { expertFrameworks } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import {
  getTeacherOwnedFramework,
  getTeacherOwnedTopic,
} from "@/lib/learning/expert-access";
import { createDefaultDeepFramework } from "@/lib/learning/framework-packages";
import { ensureTopicFramework } from "@/lib/learning/storage";

const createFrameworkSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  topicId: z.string().min(1),
});

export async function GET() {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const frameworks = await getDb().query.expertFrameworks.findMany({
      with: {
        topic: {
          with: {
            classroom: true,
          },
        },
        classroom: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
    });

    return NextResponse.json({
      success: true,
      data: frameworks
        .filter((framework) => {
          const ownerId =
            framework.topic?.classroom.teacherUserId ??
            framework.classroom?.teacherUserId ??
            null;
          return ownerId === session.user.id;
        })
        .map((framework) => ({
          id: framework.id,
          name: framework.name,
          description: framework.description,
          topicId: framework.topicId,
          topicTitle: framework.topic?.title ?? null,
          activeVersionId: framework.activeVersionId,
        })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load frameworks" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const body = createFrameworkSchema.parse(await request.json());
    const topic = await getTeacherOwnedTopic(session.user.id, body.topicId);
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const ensured = await ensureTopicFramework({
      topicId: body.topicId,
      classroomId: topic.classroomId,
    });
    const framework = await getTeacherOwnedFramework(session.user.id, ensured.id);
    if (!framework) {
      return NextResponse.json({ error: "Framework not found" }, { status: 404 });
    }

    await getDb()
      .update(expertFrameworks)
      .set({
        name: body.name,
        description:
          body.description ??
          "Expert-authored course framework seeded from the editable DEEP default.",
        classroomId: topic.classroomId,
        updatedAt: new Date(),
      })
      .where(eq(expertFrameworks.id, framework.id));

    const runtimeModels = await getDb().query.expertRuntimeModels.findMany({
      where: (table, { eq }) => eq(table.topicId, body.topicId),
      orderBy: (table, { desc }) => [desc(table.version)],
      limit: 1,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: ensured.id,
        name: body.name,
        description: body.description ?? "",
        topicId: body.topicId,
        activeVersionId: ensured.activeVersionId,
        defaultFramework: createDefaultDeepFramework(),
        latestRuntimeModelId: runtimeModels[0]?.id ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create framework" },
      { status: 400 },
    );
  }
}
