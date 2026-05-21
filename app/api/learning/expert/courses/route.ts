import { NextResponse } from "next/server";
import { z } from "zod";

import { createCourse } from "@/lib/learning/course-service";
import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

const createCourseSchema = z.object({
  title: z.string().min(2, "Course title must be at least 2 characters long"),
  description: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;

    const body = createCourseSchema.parse(await request.json());

    const course = await createCourse({
      title: body.title,
      description: body.description,
      createdByUserId: expert.session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: course,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }
    return handleLearningRouteError(error, "Failed to create course", "expert-courses:post");
  }
}
