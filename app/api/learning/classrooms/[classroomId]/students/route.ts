import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  bulkInviteStudentsToClassroomAction,
  inviteStudentToClassroomAction,
} from "@/app/actions/classroom";
import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherClassroomAccess } from "@/lib/learning/access";

const singleStudentInviteSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
});

const bulkStudentInviteSchema = z.object({
  students: z
    .array(
      z.object({
        fullName: z.string().min(2),
        email: z.string().email(),
      }),
    )
    .min(1),
});

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
  try {
    const payload: unknown = await request.json().catch(() => null);
    const { classroomId } = await params;

    const bulkInvite = bulkStudentInviteSchema.safeParse(payload);
    if (bulkInvite.success) {
      const result = await bulkInviteStudentsToClassroomAction({
        classroomId,
        students: bulkInvite.data.students,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    const singleInvite = singleStudentInviteSchema.safeParse(payload);
    if (singleInvite.success) {
      const result = await inviteStudentToClassroomAction({
        classroomId,
        fullName: singleInvite.data.fullName,
        email: singleInvite.data.email,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    return NextResponse.json(
      {
        error:
          "Provide either a single student with fullName and email, or a students array for bulk import.",
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to invite students",
      },
      { status: 400 },
    );
  }
}
