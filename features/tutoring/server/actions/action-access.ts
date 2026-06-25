import { z } from "zod";
import { revalidatePath } from "next/cache";

import { resolveTeacherOwnedClassroomAccess } from "@/features/tutoring/public-server";
import {
  requireStudentUser,
  requireTeacherUser,
} from "@/features/auth/public-server";
import {
  ForbiddenError,
  NotFoundError,
} from "@/shared/http/action-result";

export const appLocaleSchema = z.enum(["en", "fr", "de"]);

export async function requireTeachingSession() {
  const session = await requireTeacherUser();
  return { session };
}

export async function requireStudentSession() {
  const session = await requireStudentUser();
  return { session };
}

export async function ensureClassroomOwnerAccess(
  userId: string,
  classroomId: string,
) {
  const classroomAccess = await resolveTeacherOwnedClassroomAccess({
    teacherUserId: userId,
    classroomId,
  });

  if ("error" in classroomAccess) {
    if (classroomAccess.error === "UNAUTHORIZED") {
      throw new NotFoundError("Classroom");
    }

    throw new ForbiddenError("Only the classroom owner can perform this action.");
  }

  return classroomAccess.classroom;
}

export function revalidateLearningUi() {
  revalidatePath("/", "layout");
}
