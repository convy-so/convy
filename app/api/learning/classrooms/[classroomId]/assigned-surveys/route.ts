import { NextResponse } from "next/server";

import { getClassroomAssignedSurveyProgressAction } from "@/app/actions/classroom";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  const result = await getClassroomAssignedSurveyProgressAction(classroomId);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
