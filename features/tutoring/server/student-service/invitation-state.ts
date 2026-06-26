import { and, eq, gt, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { logAuthAuditEvent } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import {
  classroomInvitations,
  classroomStudents,
  users,
} from "@/shared/db/schema";
import { EmailService } from "@/shared/email/email-service";
import { publishClassroomRealtimeEvent } from "@/shared/infra/realtime";
import { ValidationError } from "@/shared/http/action-result";
import { TUTORING_STATUS } from "@/shared/tutoring/constants";
import { USER_ROLE } from "@/shared/surveys/constants";

import { PENDING_INVITE_STATUS } from "./invitation-model";

export async function listPendingInvitationsForUser(userId: string) {
  const user = await getDb().query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return [];

  const normalizedEmail = user.email.trim().toLowerCase();

  try {
    return await getDb().query.classroomInvitations.findMany({
      where: and(
        eq(classroomInvitations.invitedEmail, normalizedEmail),
        eq(classroomInvitations.status, PENDING_INVITE_STATUS),
      ),
      with: { classroom: true },
    });
  } catch (error) {
    console.warn(
      "[student-service] listPendingInvitationsForUser: failed to list pending invitations",
      {
        userId,
        email: normalizedEmail,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return [];
  }
}

export async function respondToInvitation(params: {
  invitationId: string;
  userId: string;
  decision: "accepted" | "rejected";
}) {
  console.log("[student-service] respondToInvitation: START", {
    invitationId: params.invitationId,
    userId: params.userId,
    decision: params.decision,
  });

  const invitation = await getDb().query.classroomInvitations.findFirst({
    where: eq(classroomInvitations.id, params.invitationId),
  });

  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  if (invitation.status !== PENDING_INVITE_STATUS) {
    const isIdempotentAccept =
      params.decision === "accepted" &&
      invitation.status === "accepted" &&
      invitation.acceptedByUserId === params.userId;
    const isIdempotentReject =
      params.decision === "rejected" && invitation.status === "rejected";

    if (isIdempotentAccept || isIdempotentReject) {
      logAuthAuditEvent("invite_acceptance_replay", {
        invitationId: params.invitationId,
        userId: params.userId,
        decision: params.decision,
        currentStatus: invitation.status,
      });
      console.warn("[student-service] respondToInvitation: idempotent replay", {
        invitationId: params.invitationId,
        userId: params.userId,
        decision: params.decision,
        currentStatus: invitation.status,
      });
      return;
    }

    throw new Error("Invitation not found or no longer pending.");
  }

  const user = await getDb().query.users.findFirst({
    where: eq(users.id, params.userId),
  });

  if (!user || user.email.trim().toLowerCase() !== invitation.invitedEmail) {
    logAuthAuditEvent("invite_email_mismatch", {
      invitationId: params.invitationId,
      invitedEmail: invitation.invitedEmail,
      currentEmail: user?.email?.trim().toLowerCase() ?? null,
      userId: params.userId,
    });
    throw new Error("Invitation email does not match the signed-in user.");
  }

  if (user.role !== USER_ROLE.STUDENT) {
    logAuthAuditEvent("staff_invitation_blocked", {
      invitationId: params.invitationId,
      invitedEmail: invitation.invitedEmail,
      currentEmail: user.email.trim().toLowerCase(),
      currentRole: user.role,
      userId: params.userId,
    });
    throw new Error("Only student accounts may accept classroom invitations.");
  }

  const now = new Date();

  await getDb().transaction(async (tx) => {
    const [updatedInvitation] = await tx
      .update(classroomInvitations)
      .set({
        status: params.decision,
        acceptedByUserId: params.decision === "accepted" ? params.userId : null,
        respondedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(classroomInvitations.id, params.invitationId),
          eq(classroomInvitations.status, PENDING_INVITE_STATUS),
        ),
      )
      .returning({ id: classroomInvitations.id });

    if (!updatedInvitation) {
      const latestInvitation = await tx.query.classroomInvitations.findFirst({
        where: eq(classroomInvitations.id, params.invitationId),
      });

      const isIdempotentAccept =
        params.decision === "accepted" &&
        latestInvitation?.status === "accepted" &&
        latestInvitation.acceptedByUserId === params.userId;
      const isIdempotentReject =
        params.decision === "rejected" && latestInvitation?.status === "rejected";

      if (isIdempotentAccept || isIdempotentReject) {
        logAuthAuditEvent("invite_acceptance_replay", {
          invitationId: params.invitationId,
          userId: params.userId,
          decision: params.decision,
          currentStatus: latestInvitation?.status ?? null,
        });
        console.warn("[student-service] respondToInvitation: conflict resolved as replay", {
          invitationId: params.invitationId,
          userId: params.userId,
          decision: params.decision,
        });
        return;
      }

      throw new Error("Invitation not found or no longer pending.");
    }

    if (params.decision !== "accepted") {
      console.log("[student-service] respondToInvitation: invitation rejected", {
        invitationId: params.invitationId,
        userId: params.userId,
      });
      return;
    }

    const existingMembership = await tx.query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, invitation.classroomId),
        or(
          eq(classroomStudents.userId, params.userId),
          eq(classroomStudents.email, invitation.invitedEmail),
        ),
      ),
    });

    if (!existingMembership) {
      await tx.insert(classroomStudents).values({
        id: nanoid(),
        classroomId: invitation.classroomId,
        userId: params.userId,
        invitedByUserId: invitation.invitedByUserId,
        fullName: user.name ?? user.email,
        email: invitation.invitedEmail,
        inviteStatus: TUTORING_STATUS.inviteAccepted,
        onboardingStatus: TUTORING_STATUS.onboardingInterestProfilePending,
        createdAt: now,
        updatedAt: now,
      });
      console.log("[student-service] respondToInvitation: classroomStudents seat created", {
        invitationId: params.invitationId,
        userId: params.userId,
        classroomId: invitation.classroomId,
      });
      return;
    }

    if (existingMembership.userId && existingMembership.userId !== params.userId) {
      throw new Error("That invitation has already been claimed by another account.");
    }

    await tx
      .update(classroomStudents)
      .set({
        userId: params.userId,
        fullName: user.name ?? user.email,
        email: invitation.invitedEmail,
        inviteStatus: TUTORING_STATUS.inviteAccepted,
        updatedAt: now,
      })
      .where(eq(classroomStudents.id, existingMembership.id));
  });

  console.log("[student-service] respondToInvitation: DONE", {
    invitationId: params.invitationId,
    decision: params.decision,
  });

  void publishClassroomRealtimeEvent(invitation.classroomId, {
    type: "classroom_roster_updated",
    reason:
      params.decision === "accepted"
        ? "invitation_accepted"
        : "invitation_rejected",
    invitationId: params.invitationId,
    studentUserId: params.userId,
    email: invitation.invitedEmail,
  });
}

export async function resendStudentInvitation(params: {
  invitationId: string;
  classroomId: string;
  requestedByUserId: string;
}) {
  console.log("[student-service] resendStudentInvitation: START", {
    invitationId: params.invitationId,
    classroomId: params.classroomId,
  });

  const invitation = await getDb().query.classroomInvitations.findFirst({
    where: and(
      eq(classroomInvitations.id, params.invitationId),
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
    ),
    with: { classroom: true },
  });

  if (!invitation) {
    throw new ValidationError("Invitation not found or is no longer pending.");
  }

  const classroom = invitation.classroom;
  if (!classroom) {
    throw new Error("Classroom not found for this invitation.");
  }

  const invitationTtlDays = 7;
  const newExpiresAt = new Date(
    Date.now() + invitationTtlDays * 24 * 60 * 60 * 1000,
  );

  await getDb()
    .update(classroomInvitations)
    .set({ expiresAt: newExpiresAt, updatedAt: new Date() })
    .where(eq(classroomInvitations.id, params.invitationId));

  console.log("[student-service] resendStudentInvitation: extended expiry, re-queuing email", {
    invitationId: params.invitationId,
    email: invitation.invitedEmail,
    newExpiresAt,
  });

  try {
    const job = await EmailService.sendStudentInvitationEmail({
      email: invitation.invitedEmail,
      invitationId: params.invitationId,
      classroomName: classroom.title,
    });

    if (!job) {
      console.warn(
        "[student-service] resendStudentInvitation: email job was deduplicated (already in queue)",
        {
          invitationId: params.invitationId,
          email: invitation.invitedEmail,
        },
      );
    } else {
      console.log("[student-service] resendStudentInvitation: email job enqueued", {
        invitationId: params.invitationId,
        email: invitation.invitedEmail,
        jobId: job.id,
      });
    }
  } catch (error) {
    console.error("[student-service] resendStudentInvitation: failed to enqueue email", {
      invitationId: params.invitationId,
      email: invitation.invitedEmail,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Failed to queue the invitation email. Please try again.");
  }

  void publishClassroomRealtimeEvent(params.classroomId, {
    type: "classroom_roster_updated",
    reason: "invitation_resent",
    invitationId: params.invitationId,
    email: invitation.invitedEmail,
  });

  return {
    invitationId: params.invitationId,
    email: invitation.invitedEmail,
    newExpiresAt,
  };
}

export async function cancelStudentInvitation(params: {
  invitationId: string;
  classroomId: string;
  requestedByUserId: string;
}) {
  console.log("[student-service] cancelStudentInvitation: START", {
    invitationId: params.invitationId,
    classroomId: params.classroomId,
  });

  const [updated] = await getDb()
    .update(classroomInvitations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(classroomInvitations.id, params.invitationId),
        eq(classroomInvitations.classroomId, params.classroomId),
        eq(classroomInvitations.status, PENDING_INVITE_STATUS),
      ),
    )
    .returning({ id: classroomInvitations.id });

  if (!updated) {
    throw new ValidationError("Invitation not found or is no longer pending.");
  }

  console.log("[student-service] cancelStudentInvitation: DONE", {
    invitationId: params.invitationId,
  });

  void publishClassroomRealtimeEvent(params.classroomId, {
    type: "classroom_roster_updated",
    reason: "invitation_cancelled",
    invitationId: params.invitationId,
  });

  return { invitationId: params.invitationId };
}

export async function listPendingClassroomInvitations(params: { classroomId: string }) {
  const now = new Date();

  return await getDb().query.classroomInvitations.findMany({
    where: and(
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
      or(
        isNull(classroomInvitations.expiresAt),
        gt(classroomInvitations.expiresAt, now),
      ),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
}

