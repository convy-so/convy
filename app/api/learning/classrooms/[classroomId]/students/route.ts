import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { inviteStudentToClassroomAction } from "@/app/actions/classroom";
import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherClassroomAccess } from "@/lib/learning/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { classroomId } = await params;
    const classroom = await getTeacherClassroomAccess(session.user.id, classroomId);

    if (!classroom) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const students = await getDb().query.classroomStudents.findMany({
      where: eq(classroomStudents.classroomId, classroom.id),
      with: {
        interestProfile: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        inviteStatus: student.inviteStatus,
        onboardingStatus: student.onboardingStatus,
        profileLastUpdated: student.interestProfile?.profile.lastUpdated ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load students" },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const body = await request.json();
  const { classroomId } = await params;
  const result = await inviteStudentToClassroomAction({
    classroomId,
    fullName: body.fullName,
    email: body.email,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
