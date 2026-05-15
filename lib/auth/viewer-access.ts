import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { classroomInvitations, classroomStudents } from "@/db/schema";
import type { AuthSessionWithUser } from "@/lib/auth";
import { getPlatformRole } from "@/lib/auth/roles";

export type ViewerArea = "teacher-dashboard" | "student" | "expert" | "admin";

export type ViewerAccessContext = {
  authRole: "student" | "teacher" | "expert" | "admin";
  allowedAreas: ViewerArea[];
  defaultArea: ViewerArea;
  pendingInvitationCount: number;
  studentMembershipSummary: Array<{
    classroomId: string;
    classroomTitle: string;
  }>;
};

export async function resolveViewerAccess(
  session: AuthSessionWithUser,
): Promise<ViewerAccessContext> {
  const authRole = getPlatformRole(session.user);

  const [memberships, invitations] = await Promise.all([
    authRole === "student"
      ? getDb().query.classroomStudents.findMany({
          where: eq(classroomStudents.userId, session.user.id),
          with: {
            classroom: {
              columns: {
                id: true,
                title: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    authRole === "student"
      ? getDb().query.classroomInvitations.findMany({
          where: eq(classroomInvitations.invitedEmail, session.user.email.trim().toLowerCase()),
        })
      : Promise.resolve([]),
  ]);

  const allowedAreas: ViewerArea[] =
    authRole === "student"
      ? ["student"]
      : authRole === "teacher"
        ? ["teacher-dashboard"]
        : authRole === "expert"
          ? ["expert", "teacher-dashboard"]
          : ["admin", "expert", "teacher-dashboard"];

  const defaultArea =
    authRole === "student"
      ? "student"
      : authRole === "teacher"
        ? "teacher-dashboard"
        : authRole === "expert"
          ? "expert"
          : "admin";

  return {
    authRole,
    allowedAreas,
    defaultArea,
    pendingInvitationCount: invitations.filter((invitation) => invitation.status === "pending").length,
    studentMembershipSummary: memberships.map((membership) => ({
      classroomId: membership.classroom.id,
      classroomTitle: membership.classroom.title,
    })),
  };
}
