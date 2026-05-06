import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { listStudentModelSummaries } from "@/lib/learning/storage";

export async function GET() {
  try {
    const session = await getVerifiedSession();

    const memberships = await getDb().query.classroomStudents.findMany({
      where: and(
        eq(classroomStudents.userId, session.user.id),
        eq(classroomStudents.inviteStatus, "accepted"),
      ),
      with: {
        classroom: true,
      },
    });

    if (memberships.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const models = await listStudentModelSummaries({
      studentUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: models.map((model) => ({
        scopeType: "student",
        subjectKey: null,
        subjectLabel: model.classroomStudent.classroom.title,
        patternConfidence:
          model.latestSnapshot?.snapshot.cognitiveStyleCalibration.confidence ?? 0,
        confidenceLabel:
          model.latestSnapshot?.snapshot.cognitiveStyleCalibration.confidence &&
          model.latestSnapshot.snapshot.cognitiveStyleCalibration.confidence > 0.65
            ? "Established"
            : "Emerging",
        studentSummary:
          model.latestSnapshot?.snapshot.summary || "Personalization model is still forming.",
        persistentMisconceptions: [],
        updatedAt: model.latestSnapshot?.updatedAt ?? model.updatedAt,
        motivationalContext:
          model.latestSnapshot?.snapshot.motivationalContext ?? null,
        cognitiveStyleCalibration:
          model.latestSnapshot?.snapshot.cognitiveStyleCalibration ?? null,
        productiveStruggleCalibration:
          model.latestSnapshot?.snapshot.productiveStruggleCalibration ?? null,
        longitudinalDevelopment:
          model.latestSnapshot?.snapshot.longitudinalDevelopment ?? null,
      })),
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load student model summaries", "/api/learning/me/patterns");
  }
}
