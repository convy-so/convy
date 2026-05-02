import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherClassroomAccess } from "@/lib/learning/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId } = await params;

    const membership = await getDb().query.classroomStudents.findFirst({
      where: (table, { eq }) => eq(table.id, studentId),
      with: {
        classroom: true,
        studentModel: {
          with: {
            snapshots: {
              orderBy: (table, { desc }) => [desc(table.version)],
              limit: 1,
            },
          },
        },
      },
    });

    if (!membership) {
      return apiError("NOT_FOUND", "Student not found");
    }

    const access = await getTeacherClassroomAccess(session.user.id, membership.classroomId);

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const latestSnapshot = membership.studentModel?.snapshots[0]?.snapshot ?? null;

    return NextResponse.json({
      success: true,
      data: {
        student: {
          id: membership.id,
          fullName: membership.fullName,
          email: membership.email,
        },
        profiles: latestSnapshot
          ? [
              {
                scopeType: "student",
                subjectKey: null,
                subjectLabel: membership.classroom.title,
                patternConfidence:
                  latestSnapshot.cognitiveStyleCalibration.confidence ?? 0,
                confidenceLabel:
                  latestSnapshot.cognitiveStyleCalibration.confidence > 0.65
                    ? "Established"
                    : "Emerging",
                studentSummary: latestSnapshot.summary,
                persistentMisconceptions: [],
                updatedAt: membership.studentModel?.snapshots[0]?.updatedAt,
                motivationalContext: latestSnapshot.motivationalContext,
                knowledgeStateModel: latestSnapshot.knowledgeStateModel,
                cognitiveStyleCalibration: latestSnapshot.cognitiveStyleCalibration,
                productiveStruggleCalibration:
                  latestSnapshot.productiveStruggleCalibration,
                longitudinalDevelopment: latestSnapshot.longitudinalDevelopment,
              },
            ]
          : [],
      },
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load student model", "/api/learning/students/[studentId]/patterns");
  }
}
