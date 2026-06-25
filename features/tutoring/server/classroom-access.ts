import { getTeacherClassroomAccess } from "@/features/tutoring/server/access";

export async function resolveTeacherClassroomAccess(input: {
  teacherUserId: string;
  classroomId: string;
}) {
  const classroom = await getTeacherClassroomAccess(
    input.teacherUserId,
    input.classroomId,
  );

  if (!classroom) return { error: "UNAUTHORIZED" as const };

  return { classroom };
}

export async function resolveTeacherOwnedClassroomAccess(input: {
  teacherUserId: string;
  classroomId: string;
}) {
  const base = await resolveTeacherClassroomAccess(input);
  if ("error" in base) return base;
  if (base.classroom.accessLevel !== "owner") {
    return { error: "FORBIDDEN" as const };
  }

  return base;
}
