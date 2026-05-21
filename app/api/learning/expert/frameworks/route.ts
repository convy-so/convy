import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { expertFrameworks } from "@/db/schema";
import { getCourseById, listCourses } from "@/lib/learning/course-service";
import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import {
  getFrameworkWithTopicLite,
  listFrameworksWithTopicLite,
} from "@/lib/learning/framework-records";
import { ensureSubjectFramework } from "@/lib/learning/storage";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

const createFrameworkSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  courseId: z.string().min(1),
});

export async function GET() {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const [frameworks, courses] = await Promise.all([
      listFrameworksWithTopicLite(),
      listCourses(),
    ]);

    return NextResponse.json({
      success: true,
      data: courses.map((course) => {
        const framework =
          frameworks.find((candidate) => candidate.courseId === course.id) ?? null;

        return {
          id: framework?.id ?? null,
          courseId: course.id,
          courseKey: course.key,
          courseTitle: course.title,
          name: framework?.name ?? `${course.title} DEEP`,
          description: framework?.description ?? course.description,
          topicId: framework?.topicId ?? null,
          anchorTopicTitle: framework?.topic?.title ?? null,
          activeVersionId: framework?.activeVersionId ?? null,
        };
      }),
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load frameworks", "expert-frameworks:get");
  }
}

export async function POST(request: Request) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const body = createFrameworkSchema.parse(await request.json());
    const course = await getCourseById(body.courseId);

    if (!course) {
      return apiError("NOT_FOUND", "Course not found");
    }

    const ensured = await ensureSubjectFramework({
      subjectKey: course.key,
      courseId: course.id,
    });
    const framework = await getFrameworkWithTopicLite(ensured.id);
    if (!framework) {
      return apiError("NOT_FOUND", "Framework not found");
    }

    await getDb()
      .update(expertFrameworks)
      .set({
        name: body.name,
        description:
          body.description ??
          "Expert-authored course framework seeded from the editable DEEP default.",
        classroomId: framework.classroomId ?? framework.topic?.classroomId ?? null,
        courseId: course.id,
        subjectKey: course.key,
        updatedAt: new Date(),
      })
      .where(eq(expertFrameworks.id, framework.id));

    return NextResponse.json({
      success: true,
      data: {
        id: ensured.id,
        courseId: course.id,
        courseKey: course.key,
        courseTitle: course.title,
        name: body.name,
        description: body.description ?? "",
        topicId: framework.topicId,
        anchorTopicTitle: framework.topic?.title ?? null,
        activeVersionId: ensured.activeVersionId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }
    return handleLearningRouteError(error, "Failed to create framework", "expert-frameworks:post");
  }
}
