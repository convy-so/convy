"use server";

import { z } from "zod";

import { resolveTeacherOwnedClassroomAccess } from "@/lib/access/classroom-access";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/action-wrapper";

export const appLocaleSchema = z.enum(["en", "fr", "de"]);

export async function requireTeachingSession() {
  const session = await getVerifiedSession();
  if (!session) throw new UnauthorizedError();
  return { session };
}

export async function ensureClassroomOwnerAccess(userId: string, classroomId: string) {
  const classroomAccess = await resolveTeacherOwnedClassroomAccess({
    teacherUserId: userId,
    classroomId,
  });

  if ("error" in classroomAccess) {
    if (classroomAccess.error === "UNAUTHORIZED") throw new NotFoundError("Classroom");
    throw new ForbiddenError("Only the classroom owner can perform this action.");
  }

  return classroomAccess.classroom;
}
