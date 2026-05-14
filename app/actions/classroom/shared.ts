
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { resolveTeacherOwnedClassroomAccess } from "@/lib/access/classroom-access";
import { getPlatformRole, getVerifiedSession } from "@/lib/auth/dal";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/action-wrapper";

export const appLocaleSchema = z.enum(["en", "fr", "de"]);

export async function requireTeachingSession() {
  const session = await getVerifiedSession();
  if (!session) throw new UnauthorizedError();
  const role = getPlatformRole(session.user);
  if (role !== "teacher" && role !== "admin") {
    throw new ForbiddenError("Teacher access required.");
  }
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

export function revalidateLearningUi() {
  revalidatePath("/", "layout");
}
