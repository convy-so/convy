import { NextResponse } from "next/server";

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
      return NextResponse.json(
        { error: "classroomId is required" },
        { status: 400 },
      );
    }

    const result = await getLearningInterventionsAction({
      classroomId,
      topicId,
      classroomStudentId,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load interventions",
      },
      { status: 400 },
    );
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
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create intervention",
      },
      { status: 400 },
    );
  }
}
