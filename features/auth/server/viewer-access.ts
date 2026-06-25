import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { classroomInvitations, classroomStudents } from "@/shared/db/schema";
import type { AuthSessionWithUser } from "@/features/auth/server/server-auth";
import { requirePlatformRole } from "@/features/auth/server/dal";
import { LEARNING_STATUS } from "@/shared/learning/constants";
import {
  VIEWER_AREA_VALUES,
} from "@/shared/auth/constants";

export type ViewerArea = (typeof VIEWER_AREA_VALUES)[number];

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
  const authRole = requirePlatformRole(session.user);

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
      ? [VIEWER_AREA_VALUES[1]]
      : authRole === "teacher"
        ? [VIEWER_AREA_VALUES[0]]
        : authRole === "expert"
          ? [VIEWER_AREA_VALUES[2], VIEWER_AREA_VALUES[0]]
          : [VIEWER_AREA_VALUES[3], VIEWER_AREA_VALUES[2], VIEWER_AREA_VALUES[0]];

  const defaultArea =
    authRole === "student"
      ? VIEWER_AREA_VALUES[1]
      : authRole === "teacher"
        ? VIEWER_AREA_VALUES[0]
        : authRole === "expert"
          ? VIEWER_AREA_VALUES[2]
          : VIEWER_AREA_VALUES[3];

  return {
    authRole,
    allowedAreas,
    defaultArea,
    pendingInvitationCount: invitations.filter(
      (invitation) => invitation.status === LEARNING_STATUS.invitePending,
    ).length,
    studentMembershipSummary: memberships.map((membership) => ({
      classroomId: membership.classroom.id,
      classroomTitle: membership.classroom.title,
    })),
  };
}
