import { getDb } from "@/shared/db";
import { getTeacherClassroomAccess } from "@/features/tutoring/server/access";
import { resolveTeacherClassroomAccess as resolveSharedTeacherClassroomAccess } from "@/features/tutoring/public-server";

export async function resolveTeacherStudentAccess(input: {
  teacherUserId: string;
  classroomStudentId: string;
}) {
  const membership = await getDb().query.classroomStudents.findFirst({
    where: (table, { eq }) => eq(table.id, input.classroomStudentId),
    with: { classroom: true },
  });

  if (!membership) {
    return { error: "NOT_FOUND" as const };
  }

  const access = await getTeacherClassroomAccess(
    input.teacherUserId,
    membership.classroomId,
  );

  if (!access) {
    return { error: "UNAUTHORIZED" as const };
  }

  return { membership, access };
}


export async function resolveTeacherClassroomAccess(input: {
  teacherUserId: string;
  classroomId: string;
}) {
  return resolveSharedTeacherClassroomAccess(input);
}
