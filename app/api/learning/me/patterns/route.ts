import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { listStudentLearningPatternProfiles } from "@/lib/learning/storage";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      return NextResponse.json({ error: "No active workspace selected" }, { status: 400 });
    }

    const memberships = await getDb().query.classroomStudents.findMany({
      where: and(
        eq(classroomStudents.userId, session.user.id),
        eq(classroomStudents.inviteStatus, "accepted"),
      ),
      with: {
        classroom: true,
      },
    });

    const inWorkspace = memberships.some(
      (membership) => membership.classroom.organizationId === organizationId,
    );

    if (!inWorkspace) {
      return NextResponse.json({ error: "Student context not found" }, { status: 404 });
    }

    const profiles = await listStudentLearningPatternProfiles({
      organizationId,
      studentUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: profiles.map((profile) => ({
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
        confidenceLabel: profile.profile.confidenceLabel,
        updatedAt: profile.updatedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load patterns" },
      { status: 400 },
    );
  }
}
