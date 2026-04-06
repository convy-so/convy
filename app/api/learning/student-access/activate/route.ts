import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { classroomStudents, studentAccessTokens, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { assertWorkspacePrivacyReadiness } from "@/lib/privacy/compliance";
import { summarizeErrorForLogs } from "@/lib/privacy/logging";
import { hashOpaqueToken } from "@/lib/learning/tokens";

const studentActivationBodySchema = z.object({
  token: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  fullName: z.string().trim().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const tokenHash = hashOpaqueToken(token);
    const record = await getDb().query.studentAccessTokens.findFirst({
      where: and(
        eq(studentAccessTokens.tokenHash, tokenHash),
        eq(studentAccessTokens.purpose, "activate"),
        isNull(studentAccessTokens.consumedAt),
        gt(studentAccessTokens.expiresAt, new Date()),
      ),
      with: {
        classroomStudent: {
          with: {
            classroom: true,
          },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ valid: false }, { status: 404 });
    }

    await assertWorkspacePrivacyReadiness({
      organizationId: record.classroomStudent.classroom.organizationId,
      requireAgeMode: true,
    });

    return NextResponse.json({
      valid: true,
      student: {
        fullName: record.classroomStudent.fullName,
        email: record.classroomStudent.email,
      },
      classroom: {
        id: record.classroomStudent.classroom.id,
        title: record.classroomStudent.classroom.title,
      },
      expiresAt: record.expiresAt.toISOString(),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "GDPR_WORKSPACE_PRIVACY_INCOMPLETE"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = studentActivationBodySchema.parse(await request.json());

    if (!body.token || !body.password || body.password.length < 8) {
      return NextResponse.json(
        { error: "Token and a password of at least 8 characters are required." },
        { status: 400 },
      );
    }

    const normalizedName = body.fullName?.trim();

    const tokenHash = hashOpaqueToken(body.token);
    const record = await getDb().query.studentAccessTokens.findFirst({
      where: and(
        eq(studentAccessTokens.tokenHash, tokenHash),
        eq(studentAccessTokens.purpose, "activate"),
        isNull(studentAccessTokens.consumedAt),
        gt(studentAccessTokens.expiresAt, new Date()),
      ),
      with: {
        classroomStudent: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 404 });
    }

    const classroomStudent = await getDb().query.classroomStudents.findFirst({
      where: eq(classroomStudents.id, record.classroomStudentId),
      with: {
        classroom: true,
      },
    });

    await assertWorkspacePrivacyReadiness({
      organizationId: classroomStudent?.classroom.organizationId,
      requireAgeMode: true,
    });

    await auth.api.setUserPassword({
      body: {
        userId: record.userId,
        newPassword: body.password,
      },
    });

    await getDb().transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          name: normalizedName || record.classroomStudent.fullName,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, record.userId));

      await tx
        .update(classroomStudents)
        .set({
          userId: record.userId,
          fullName: normalizedName || record.classroomStudent.fullName,
          inviteStatus: "accepted",
          onboardingStatus: "interest_profile_pending",
          updatedAt: new Date(),
        })
        .where(eq(classroomStudents.id, record.classroomStudentId));

      await tx
        .update(studentAccessTokens)
        .set({
          consumedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(studentAccessTokens.id, record.id));
    });

    return NextResponse.json({
      success: true,
      userId: record.userId,
      classroomStudentId: record.classroomStudentId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? "Invalid request body." },
        { status: 400 },
      );
    }
    if (
      error instanceof Error &&
      error.name === "GDPR_WORKSPACE_PRIVACY_INCOMPLETE"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

