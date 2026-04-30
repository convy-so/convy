import { getPlatformRole } from "@/lib/auth/roles";
import type { AuthUser } from "@/lib/auth";
import { getPersonalClassroomDirectory, listStudentMemberships } from "@/lib/learning/access";

export type EffectiveAppRole = "student" | "teacher" | "expert" | "admin";

export async function getEffectiveAppRole(user: AuthUser): Promise<EffectiveAppRole> {
  const platformRole = getPlatformRole(user);
  if (platformRole === "admin") return "admin";
  if (platformRole === "expert") return "expert";

  const [memberships, classrooms] = await Promise.all([
    listStudentMemberships(user.id),
    getPersonalClassroomDirectory(user.id),
  ]);

  if (memberships.length > 0) return "student";
  if (classrooms.length > 0) return "teacher";

  return "teacher";
}

export function isTeacherLike(role: EffectiveAppRole) {
  return role === "teacher" || role === "admin";
}
