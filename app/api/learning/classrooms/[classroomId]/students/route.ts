import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { z } from "zod";

import {
  bulkInviteStudentsToClassroomAction,
  inviteStudentToClassroomAction,
} from "@/app/actions/classroom";
import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { resolveTeacherClassroomAccess } from "@/lib/learning/teacher-route-access";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

const invitePayloadSchema = z.union([
  z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
  }),
  z.object({
    students: z
      .array(
        z.object({
          fullName: z.string().min(2),
          email: z.string().email(),
        }),
      )
      .min(1),
  }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { classroomId } = await params;
    const accessResult = await resolveTeacherClassroomAccess({
      teacherUserId: session.user.id,
      classroomId,
    });

    if (accessResult.error === "UNAUTHORIZED") {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const { classroom } = accessResult;

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
    return handleLearningRouteError(error, "Failed to load students", "/api/learning/classrooms/[classroomId]/students");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const payload: unknown = await request.json().catch(() => null);
    const { classroomId } = await params;

    const parsedInvitePayload = invitePayloadSchema.safeParse(payload);
    if (!parsedInvitePayload.success) {
      return apiError(
        "VALIDATION_ERROR",
        "Provide either a single student with fullName and email, or a students array for bulk import.",
      );
    }

    if ("students" in parsedInvitePayload.data) {
      const result = await bulkInviteStudentsToClassroomAction({
        classroomId,
        students: parsedInvitePayload.data.students,
      });
      if (!result.success) return apiError("VALIDATION_ERROR", result.error.message || "Failed to invite students", { details: result.error.details });
      return NextResponse.json(result);
    }

    const result = await inviteStudentToClassroomAction({
      classroomId,
      fullName: parsedInvitePayload.data.fullName,
      email: parsedInvitePayload.data.email,
    });
    if (!result.success) return apiError("VALIDATION_ERROR", result.error.message || "Failed to invite student", { details: result.error.details });
    return NextResponse.json(result);
  } catch (error) {
    return handleLearningRouteError(error, "Failed to invite students", "/api/learning/classrooms/[classroomId]/students");
  }
}
