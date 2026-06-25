import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { users } from "@/shared/db/schema";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { readJsonRequestValue } from "@/shared/http/json";
import { auth } from "@/features/auth/public-server";
import {
  getCurrentSession,
  isInvalidAccountStateError,
  requirePlatformRole,
  type PlatformRole,
} from "@/features/auth/public-server";
import {
  getExpertInvitationById,
  isExpertInvitationExpired,
} from "@/features/auth/public-server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRequestedName(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  const name = value["name"];
  return typeof name === "string" ? name.trim() : "";
}

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

    let role: PlatformRole;
    try {
      role = requirePlatformRole(session.user);
    } catch (error) {
      if (isInvalidAccountStateError(error)) {
        return apiError("UNAUTHORIZED", error.message);
      }
      throw error;
    }

    if (role !== "expert") {
      return apiError("UNAUTHORIZED", "Only invited experts can continue this onboarding flow.");
    }

    if (session.user.id !== invitation.invitedUserId || currentEmail !== invitation.invitedEmail) {
      return apiError("UNAUTHORIZED", "This invitation belongs to a different account.");
    }

    if (!session.user.emailVerified) {
      return apiError("VALIDATION_ERROR", "Verify your email before requesting password setup.");
    }

    const body = await readJsonRequestValue(req);
    const name = getRequestedName(body);
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
