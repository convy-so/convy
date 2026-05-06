import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { z } from "zod";

import {
  bulkInviteStudentsToClassroomAction,
  inviteStudentToClassroomAction,
} from "@/app/actions/classroom";
import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
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
      return apiError("UNAUTHORIZED", "Unauthorized");
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
    return apiUnhandledError(error, "Failed to load students", "/api/learning/classrooms/[classroomId]/students");
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
      if (!result.success) return apiError("VALIDATION_ERROR", result.error.message || "Failed to invite students", { details: result.error.details });
      return NextResponse.json(result);
    }

    const singleInvite = singleStudentInviteSchema.safeParse(payload);
    if (singleInvite.success) {
      const result = await inviteStudentToClassroomAction({
        classroomId,
        fullName: singleInvite.data.fullName,
        email: singleInvite.data.email,
      });
      if (!result.success) return apiError("VALIDATION_ERROR", result.error.message || "Failed to invite student", { details: result.error.details });
      return NextResponse.json(result);
    }

    return apiError(
      "VALIDATION_ERROR",
      "Provide either a single student with fullName and email, or a students array for bulk import."
    );
  } catch (error) {
    return apiUnhandledError(error, "Failed to invite students", "/api/learning/classrooms/[classroomId]/students");
  }
}
