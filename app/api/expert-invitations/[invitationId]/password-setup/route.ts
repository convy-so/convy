import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { auth } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/dal";
import { getPlatformRole } from "@/lib/auth/roles";
import {
  getExpertInvitationById,
  isExpertInvitationExpired,
} from "@/lib/auth/expert-invitations";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return apiError("UNAUTHENTICATED", "Sign in to continue.");
    }

    const { invitationId } = await params;
    const invitation = await getExpertInvitationById(invitationId);
    if (!invitation) {
      return apiError("NOT_FOUND", "Expert invitation not found.");
    }

    const currentEmail = session.user.email.trim().toLowerCase();
    if (invitation.status !== "pending" || isExpertInvitationExpired(invitation)) {
      return apiError("VALIDATION_ERROR", "This expert invitation is no longer active.");
    }

    if (getPlatformRole(session.user) !== "expert") {
      return apiError("UNAUTHORIZED", "Only invited experts can continue this onboarding flow.");
    }

    if (session.user.id !== invitation.invitedUserId || currentEmail !== invitation.invitedEmail) {
      return apiError("UNAUTHORIZED", "This invitation belongs to a different account.");
    }

    if (!session.user.emailVerified) {
      return apiError("VALIDATION_ERROR", "Verify your email before requesting password setup.");
    }

    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return apiError("VALIDATION_ERROR", "Name is required.");
    }

    await getDb()
      .update(users)
      .set({
        name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    const requestHeaders = new Headers(await headers());
    const returnTo = `/${invitation.locale}/expert-login`;
    const redirectTo = `/${invitation.locale}/reset-password?returnTo=${encodeURIComponent(returnTo)}`;

    await auth.api.requestPasswordReset({
      body: {
        email: invitation.invitedEmail,
        redirectTo,
      },
      headers: requestHeaders,
    });

    return Response.json({ success: true });
  } catch (error) {
    return apiUnhandledError(
      error,
      "Internal Server Error",
      "/api/expert-invitations/[invitationId]/password-setup",
    );
  }
}
