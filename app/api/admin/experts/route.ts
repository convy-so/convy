import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { auth } from "@/lib/auth";
import { getCurrentSession, isAdmin } from "@/lib/auth/dal";
import { createExpertInvitation } from "@/lib/auth/expert-invitations";
import { buildPendingExpertName } from "@/lib/auth/expert-profile";
import { normalizeIdentityEmail } from "@/lib/auth/auth-intent";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { defaultAppLocale, isAppLocale } from "@/lib/i18n/config";

function buildTemporaryPassword() {
  return `${randomBytes(24).toString("base64url")}A1!`;
}

function resolveInvitationLocale(session: Awaited<ReturnType<typeof getCurrentSession>>) {
  const candidate = session?.user.uiLocale ?? session?.user.preferredLanguage;
  return isAppLocale(candidate) ? candidate : defaultAppLocale;
}

function buildAuthHeadersWithoutSession(source: Headers) {
  const nextHeaders = new Headers();
  const host = source.get("host");
  const origin = source.get("origin");
  const xForwardedHost = source.get("x-forwarded-host");
  const xForwardedProto = source.get("x-forwarded-proto");
  const xForwardedPort = source.get("x-forwarded-port");

  if (host) nextHeaders.set("host", host);
  if (origin) nextHeaders.set("origin", origin);
  if (xForwardedHost) nextHeaders.set("x-forwarded-host", xForwardedHost);
  if (xForwardedProto) nextHeaders.set("x-forwarded-proto", xForwardedProto);
  if (xForwardedPort) nextHeaders.set("x-forwarded-port", xForwardedPort);

  return nextHeaders;
}

async function rollbackProvisionedExpert(userId: string) {
  await getDb().delete(users).where(eq(users.id, userId));
}

export async function POST(req: Request) {
  let createdUserId: string | null = null;

  try {
    const session = await getCurrentSession();
    if (!session || !isAdmin(session.user)) {
      return apiError("UNAUTHORIZED", "Admin access required.");
    }

    const { email } = await req.json();
    const normalizedEmail = typeof email === "string" ? normalizeIdentityEmail(email) : "";

    if (!normalizedEmail) {
      return apiError("VALIDATION_ERROR", "Email is required.");
    }

    const existingUser = await getDb().query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });
    if (existingUser) {
      return apiError(
        "CONFLICT",
        "That email already belongs to an existing account. Use a different email for expert onboarding.",
      );
    }

    const requestHeaders = new Headers(await headers());
    const sessionlessAuthHeaders = buildAuthHeadersWithoutSession(requestHeaders);
    const createUserResult = await auth.api.createUser({
      body: {
        name: buildPendingExpertName(),
        email: normalizedEmail,
        password: buildTemporaryPassword(),
      },
      headers: requestHeaders,
    });
    createdUserId = createUserResult.user.id;
    console.log("[admin-expert] user_created", {
      createdUserId,
      normalizedEmail,
      createdUserEmail: createUserResult.user.email,
    });

    await auth.api.setRole({
      body: {
        userId: createdUserId,
        role: "expert",
      },
      headers: requestHeaders,
    });
    console.log("[admin-expert] role_set", {
      createdUserId,
      role: "expert",
    });

    const invitation = await createExpertInvitation({
      invitedUserId: createdUserId,
      invitedByUserId: session.user.id,
      invitedEmail: normalizedEmail,
      locale: resolveInvitationLocale(session),
    });
    console.log("[admin-expert] invitation_created", {
      invitationId: invitation.id,
      invitedUserId: invitation.invitedUserId,
      invitedEmail: invitation.invitedEmail,
      locale: invitation.locale,
    });

    await auth.api.sendVerificationEmail({
      body: {
        email: normalizedEmail,
        callbackURL: `/${invitation.locale}/auth/continue`,
      },
      headers: sessionlessAuthHeaders,
    });
    console.log("[admin-expert] verification_sent", {
      invitationId: invitation.id,
      invitedUserId: invitation.invitedUserId,
      invitedEmail: invitation.invitedEmail,
      usedSessionlessHeaders: true,
    });

    return Response.json({
      success: true,
      userId: createdUserId,
      invitationId: invitation.id,
    });
  } catch (error) {
    console.error("[admin-expert] provisioning_failed", {
      createdUserId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error && error.message.includes("active expert invitation already exists")) {
      return apiError("CONFLICT", error.message);
    }

    if (createdUserId) {
      try {
        await rollbackProvisionedExpert(createdUserId);
      } catch (rollbackError) {
        return apiUnhandledError(
          new AggregateError(
            [error, rollbackError],
            "Expert provisioning failed and rollback was unsuccessful.",
          ),
          "Internal Server Error",
          "/api/admin/experts",
        );
      }
    }

    return apiUnhandledError(error, "Internal Server Error", "/api/admin/experts");
  }
}
