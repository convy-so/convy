import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import {
  createLearningInterventionAction,
  getLearningInterventionsAction,
} from "@/app/actions/classroom";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get("classroomId");
    const topicId = searchParams.get("topicId") ?? undefined;
    const classroomStudentId =
      searchParams.get("classroomStudentId") ?? undefined;

    if (!classroomId) {
      return apiError("VALIDATION_ERROR", "classroomId is required");
    }

    const result = await getLearningInterventionsAction({
      classroomId,
      topicId,
      classroomStudentId,
    });
    if (!result.success) return apiError("INTERNAL_ERROR", result.error);
    return NextResponse.json(result);
  } catch (error) {
    return apiUnhandledError(error, "Failed to load interventions", "/api/learning/interventions");
  }
}

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json().catch(() => null);
    const result = await createLearningInterventionAction(
      (typeof payload === "object" && payload !== null ? payload : {}) as Parameters<
        typeof createLearningInterventionAction
      >[0],
    );
    if (!result.success) return apiError("VALIDATION_ERROR", result.error);
    return NextResponse.json(result);
  } catch (error) {
    return apiUnhandledError(error, "Failed to create intervention", "/api/learning/interventions");
  }
}
