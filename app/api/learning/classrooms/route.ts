import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import {
  createClassroomAction,
  getTeacherClassroomsAction,
} from "@/app/actions/classroom";

export async function GET() {
  const result = await getTeacherClassroomsAction();
  if (!result.success) return apiError("INTERNAL_ERROR", result.error.message || "Failed to fetch classrooms");
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = await createClassroomAction(body);
  if (!result.success) return apiError("VALIDATION_ERROR", result.error.message || "Failed to create classroom", { details: result.error.details });
  return NextResponse.json(result);
}
