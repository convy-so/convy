import { NextResponse } from "next/server";
import { z } from "zod";

import { getCourseById } from "@/features/tutoring/server/course-service";
import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { getCourseFrameworks, createExpertFrameworkForCourse } from "@/features/tutoring/public-server";
import { apiError } from "@/shared/http/api-error";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";

const createFrameworkSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { courseId } = await params;
    const course = await getCourseById(courseId);

    if (!course) {
      return apiError("NOT_FOUND", "Course not found");
    }

    const frameworks = await getCourseFrameworks(courseId);

    return NextResponse.json({
      success: true,
      data: {
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
        },
        frameworks,
      },
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load course frameworks",
      "expert-course-frameworks:get",
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { courseId } = await params;
    const course = await getCourseById(courseId);

    if (!course) {
      return apiError("NOT_FOUND", "Course not found");
    }

    const body = createFrameworkSchema.parse(await request.json());
    const created = await createExpertFrameworkForCourse({
      courseId,
      name: body.name,
      description: body.description,
    });

    return NextResponse.json({
      success: true,
      data: created,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }
    return handleLearningRouteError(
      error,
      "Failed to create framework",
      "expert-course-frameworks:post",
    );
  }
}
