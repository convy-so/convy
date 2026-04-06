import { NextResponse } from "next/server";
import { z } from "zod";

import {
  grantClassroomCollaboratorAccessAction,
  getClassroomCollaboratorsAction,
  revokeClassroomCollaboratorAccessAction,
} from "@/app/actions/classroom";

const collaboratorInviteSchema = z.object({
  email: z.string().email(),
});

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
  const payload: unknown = await request.json().catch(() => null);
  const { classroomId } = await params;
  const teacherUserId =
    typeof payload === "object" &&
    payload !== null &&
    "teacherUserId" in payload &&
    typeof payload.teacherUserId === "string"
      ? payload.teacherUserId
      : "";
  const result = await revokeClassroomCollaboratorAccessAction({
    classroomId,
    teacherUserId,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const payload: unknown = await request.json().catch(() => null);
    const parsed = collaboratorInviteSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid collaborator email" },
        { status: 400 },
      );
    }

    const { classroomId } = await params;
    const result = await grantClassroomCollaboratorAccessAction({
      classroomId,
      email: parsed.data.email,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to grant collaborator access",
      },
      { status: 400 },
    );
  }
}
