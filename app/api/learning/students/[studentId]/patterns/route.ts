import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherClassroomAccess } from "@/lib/learning/access";
import { listStudentLearningPatternProfiles } from "@/lib/learning/storage";

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
      },
    });

    if (!membership || !membership.userId) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const access = await getTeacherClassroomAccess(
      session.user.id,
      membership.classroomId,
    );

    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const profiles = await listStudentLearningPatternProfiles({
      organizationId: membership.classroom.organizationId,
      studentUserId: membership.userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        student: {
          id: membership.id,
          fullName: membership.fullName,
          email: membership.email,
        },
        profiles: profiles.map((profile) => ({
          scopeType: profile.scopeType,
          subjectKey: profile.subjectKey,
          subjectLabel: profile.subjectLabel,
          patternConfidence: profile.profile.patternConfidence,
          explanationApproaches: profile.profile.explanationApproaches,
          interestResonance: profile.profile.interestResonance,
          cognitivePattern: profile.profile.cognitivePattern,
          motivationalPattern: profile.profile.motivationalPattern,
          confidenceMindsetPattern: profile.profile.confidenceMindsetPattern,
          persistentMisconceptions: profile.profile.persistentMisconceptions,
          summaryLocale: profile.summaryLocale,
          studentSummary: profile.studentSummary,
          teacherSummary: profile.teacherSummary,
          confidenceLabel: profile.profile.confidenceLabel,
          engagementTrend: profile.profile.engagementTrend,
          updatedAt: profile.updatedAt,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load student patterns" },
      { status: 400 },
    );
  }
}
