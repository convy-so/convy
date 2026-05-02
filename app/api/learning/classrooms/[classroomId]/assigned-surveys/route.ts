import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getClassroomAssignedSurveyProgressAction } from "@/app/actions/classroom";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  const result = await getClassroomAssignedSurveyProgressAction(classroomId);
  if (!result.success) return apiError("INTERNAL_ERROR", result.error);
  return NextResponse.json(result);
}
