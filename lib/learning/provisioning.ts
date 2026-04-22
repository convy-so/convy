import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { classroomStudents, studentAccessTokens, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendStudentActivationEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { defaultAppLocale, normalizeAppLocale } from "@/lib/i18n/config";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/learning/tokens";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCreatedUserId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.id === "string") {
    return value.id;
  }

  if (isRecord(value.user) && typeof value.user.id === "string") {
    return value.user.id;
  }

  return null;
}

export async function provisionManagedStudentAccount(params: {
  classroomStudentId: string;
}) {
  const classroomStudent = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.id, params.classroomStudentId),
    with: {
      classroom: true,
    },
  });

  if (!classroomStudent) {
    throw new Error("Student record not found.");
  }

  const normalizedEmail = classroomStudent.email.trim().toLowerCase();
  let user = await getDb().query.users.findFirst({
    where: sql`lower(${users.email}) = ${normalizedEmail}`,
  });

  if (user) {
    const existingManagedSeat = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.userId, user.id),
        eq(classroomStudents.email, normalizedEmail),
      ),
    });

    if (!existingManagedSeat) {
      throw new Error(
        "That email already belongs to an existing account and cannot be auto-managed as a student.",
      );
    }
  }

  if (!user) {
    const studentLocale = normalizeAppLocale(
      classroomStudent.classroom.defaultContentLocale,
      defaultAppLocale,
    );
    const randomPassword = generateOpaqueToken(18);
    const created = await auth.api.createUser({
      body: {
        email: normalizedEmail,
        password: randomPassword,
        name: classroomStudent.fullName,
        role: "user",
        data: {
          preferredLanguage: studentLocale,
          uiLocale: studentLocale,
        },
      },
    });

    const createdUserId = getCreatedUserId(created);

    if (!createdUserId) {
      throw new Error("Failed to create managed student account.");
    }

    user = await getDb().query.users.findFirst({
      where: eq(users.id, createdUserId),
    });
  }

  if (!user) {
    throw new Error("Failed to load managed student account.");
  }

  const activationToken = generateOpaqueToken(24);
  const tokenHash = hashOpaqueToken(activationToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await getDb()
    .delete(studentAccessTokens)
    .where(
      and(
        eq(studentAccessTokens.classroomStudentId, classroomStudent.id),
        eq(studentAccessTokens.purpose, "activate"),
      ),
    );

  await getDb().insert(studentAccessTokens).values({
    id: nanoid(),
    classroomStudentId: classroomStudent.id,
    userId: user.id,
    purpose: "activate",
    tokenHash,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await getDb()
    .update(classroomStudents)
    .set({
      userId: user.id,
      inviteStatus: "invited",
      updatedAt: new Date(),
    })
    .where(eq(classroomStudents.id, classroomStudent.id));

  const locale = normalizeAppLocale(
    classroomStudent.classroom.defaultContentLocale,
    defaultAppLocale,
  );
  const activationLink = `${env.APP_BASE_URL}/${locale}/student-access/activate?token=${activationToken}`;

  await sendStudentActivationEmail({
    email: normalizedEmail,
    studentName: classroomStudent.fullName,
    classroomName: classroomStudent.classroom.title,
    activationLink,
    locale,
  });

  return {
    classroomStudentId: classroomStudent.id,
    userId: user.id,
    activationLink,
    email: normalizedEmail,
  };
}
