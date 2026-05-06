import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/lib/api/error-contract";
import { getVerifiedSession } from "@/lib/auth/dal";
import { listPendingInvitationsForUser } from "@/lib/learning/student-service";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const invitations = await listPendingInvitationsForUser(session.user.id);
    return NextResponse.json({
      success: true,
      data: invitations.map((invitation) => ({
        id: invitation.id,
        classroomId: invitation.classroomId,
        classroomTitle: invitation.classroom?.title ?? "Classroom",
        invitedEmail: invitation.invitedEmail,
        status: invitation.status,
        expiresAt: invitation.expiresAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load invitations", "/api/learning/invitations/me");
  }
}
