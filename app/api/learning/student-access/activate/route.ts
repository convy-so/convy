import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getDb } from "@/db";
import { accounts, classroomStudents, studentAccessTokens, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hashOpaqueToken } from "@/lib/learning/tokens";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

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
      return apiError("VALIDATION_ERROR", "Missing token");
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
      // Maintaining exactly 404 response for validation logic but using standard shape
      return apiError("NOT_FOUND", "Invalid or expired token");
    }

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
    return handleLearningRouteError(error, "Internal server error", "/api/learning/student-access/activate");
  }
}

export async function POST(request: Request) {
  try {
    const body = studentActivationBodySchema.parse(await request.json());

    if (!body.token || !body.password || body.password.length < 8) {
      return apiError("VALIDATION_ERROR", "Token and a password of at least 8 characters are required.");
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
      return apiError("NOT_FOUND", "Invalid or expired token.");
    }

    const ctx = await auth.$context;
    const hashedPassword = await ctx.password.hash(body.password);

    await getDb().transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accounts.userId, record.userId),
            eq(accounts.providerId, "credential"),
          ),
        );
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
      return apiError("VALIDATION_ERROR", error.errors[0]?.message ?? "Invalid request body.");
    }
    return handleLearningRouteError(error, "Internal server error", "/api/learning/student-access/activate");
  }
}

