import { headers } from "next/headers";

import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { auth } from "@/lib/auth";
import { getCurrentSession, isAdmin } from "@/lib/auth/dal";
import {
  getExpertInvitationById,
  isExpertInvitationExpired,
  markExpertInvitationSent,
} from "@/lib/auth/expert-invitations";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  try {
    const session = await getCurrentSession();
    if (!session || !isAdmin(session.user)) {
      return apiError("UNAUTHORIZED", "Admin access required.");
    }

    const { invitationId } = await params;
    const invitation = await getExpertInvitationById(invitationId);

    if (!invitation) {
      return apiError("NOT_FOUND", "Expert invitation not found.");
    }

    if (invitation.status !== "pending") {
      return apiError("VALIDATION_ERROR", "Only pending expert invitations can be resent.");
    }

    const requestHeaders = new Headers(await headers());
    await auth.api.sendVerificationEmail({
      body: {
        email: invitation.invitedEmail,
        callbackURL: `/${invitation.locale}/auth/continue`,
      },
      headers: requestHeaders,
    });

    const updated = await markExpertInvitationSent(invitation.id, {
      refreshExpiry: isExpertInvitationExpired(invitation),
    });

    return Response.json({
      success: true,
      invitationId: invitation.id,
      lastSentAt: updated?.lastSentAt?.toISOString() ?? null,
    });
  } catch (error) {
    return apiUnhandledError(
      error,
      "Internal Server Error",
      "/api/admin/experts/[invitationId]/resend",
    );
  }
}
