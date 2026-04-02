import { NextResponse } from "next/server";

import {
  getClassroomCollaboratorsAction,
  revokeClassroomCollaboratorAccessAction,
} from "@/app/actions/classroom";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  const result = await getClassroomCollaboratorsAction(classroomId);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const body = await request.json().catch(() => ({}));
  const { classroomId } = await params;
  const teacherUserId =
    typeof body.teacherUserId === "string" ? body.teacherUserId : "";
  const result = await revokeClassroomCollaboratorAccessAction({
    classroomId,
    teacherUserId,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
