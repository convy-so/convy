import { headers } from "next/headers";
import { betterAuth, InferSession, InferUser } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { authSchema, users } from "@/shared/db/schema";
import {
  normalizeIdentityEmail,
  readAuthIntentFromRequestHeaders,
  validateSignupIntent,
} from "@/features/auth/server/auth-intent";
import { logAuthAuditEvent } from "@/features/auth/server/audit";
import {
  findActivePendingExpertInvitationByEmail,
  markExpertInvitationCompleted,
} from "@/features/auth/server/expert-invitations";
import { normalizeExpertDisplayName } from "@/features/auth/server/expert-profile";
import { env } from "@/shared/config/server-env";
import type { AppLocale } from "@/shared/i18n/config";
import { defaultAppLocale, isAppLocale } from "@/shared/i18n/config";
import { EmailService } from "@/shared/email/email-service";

function isMutableRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function normalizeEmailField(body: Record<string, unknown>) {
  const email = getStringField(body, "email");

  if (email) {
    body.email = normalizeIdentityEmail(email);
  }
}

function getReturnedUserId(value: unknown): string | undefined {
  if (!isMutableRecord(value)) {
    return undefined;
  }

  const user = value.user;
  if (!isMutableRecord(user)) {
    return undefined;
  }

  return getStringField(user, "id");
}

function readLocaleField(
  value: unknown,
  fieldName: "uiLocale" | "preferredLanguage",
): AppLocale | undefined {
  if (!isMutableRecord(value)) {
    return undefined;
  }

  const candidate = value[fieldName];
  return isAppLocale(candidate) ? candidate : undefined;
}

async function readSignupRoleIntent(requestHeaders?: Headers | null) {
  const intent = await readAuthIntentFromRequestHeaders(requestHeaders);
  if (
    !intent ||
    (intent.kind !== "direct-signup" && intent.kind !== "invite-signup") ||
    !intent.desiredRole
  ) {
    return null;
  }

  return {
    kind: intent.kind,
    desiredRole: intent.desiredRole,
  };
}

async function reconcileSignupRoleFromIntent(params: {
  userId: string;
  requestHeaders?: Headers | null;
  path?: string | null;
}) {
  const signupIntent = await readSignupRoleIntent(params.requestHeaders);
  if (!signupIntent) {
    return;
  }

  const user = await getDb().query.users.findFirst({
    where: eq(users.id, params.userId),
  });
  if (!user || user.role === signupIntent.desiredRole) {
    return;
  }

  if (user.role === "admin" || user.role === "expert") {
    return;
  }

  if (Date.now() - user.createdAt.getTime() > 60_000) {
    return;
  }

  await getDb()
    .update(users)
    .set({
      role: signupIntent.desiredRole,
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId));

  logAuthAuditEvent("role_assignment_applied", {
    path: params.path ?? null,
    userId: params.userId,
    assignedRole: signupIntent.desiredRole,
    source:
      params.path === "/sign-up/email"
        ? "email_signup_reconcile"
        : signupIntent.kind === "invite-signup"
          ? "invite_signup_reconcile"
          : "social_callback",
  });
}

export const auth = betterAuth({
  appName: "Convyy",
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    useSecureCookies: env.COOKIE_SECURE,
  },
  trustedOrigins: (() => {
    const origins = new Set<string>();
    for (const value of [env.BETTER_AUTH_URL, env.APP_BASE_URL]) {
      try {
        origins.add(new URL(value).origin);
      } catch {
        origins.add(value);
      }
    }
    return [...origins];
  })(),
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    schema: authSchema,
    provider: "pg",
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const rawIntent = await readAuthIntentFromRequestHeaders(ctx.request?.headers ?? null);
        try {
          validateSignupIntent(rawIntent);
        } catch (error) {
          logAuthAuditEvent("invalid_auth_intent", {
            path: ctx.path,
            reason: error instanceof Error ? error.message : "Unknown auth intent failure",
            hasIntent: Boolean(rawIntent),
            kind: rawIntent?.kind ?? null,
            desiredRole: rawIntent?.desiredRole ?? null,
            invitationId: rawIntent?.invitationId ?? null,
          });
          throw new APIError("BAD_REQUEST", {
            message: "Missing or invalid authentication intent.",
          });
        }
        if (isMutableRecord(ctx.body)) {
          normalizeEmailField(ctx.body);
          delete ctx.body.role;
        }
      }

      if (ctx.path === "/sign-in/email" || ctx.path === "/send-verification-email") {
        if (isMutableRecord(ctx.body)) {
          normalizeEmailField(ctx.body);
        }
      }

      if (ctx.path === "/sign-in/social") {
        const intent = await readAuthIntentFromRequestHeaders(ctx.request?.headers ?? null);
        if (!intent) {
          logAuthAuditEvent("invalid_auth_intent", {
            path: ctx.path,
            reason: "Missing authentication intent for social sign-in.",
          });
          throw new APIError("BAD_REQUEST", {
            message: "Missing authentication intent.",
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const isOAuthCallback = ctx.path.startsWith("/callback/");
      const isEmailSignup = ctx.path === "/sign-up/email";
      if (!isOAuthCallback && !isEmailSignup) {
        return;
      }

      const userId = getReturnedUserId(ctx.context.returned);
      if (!userId) {
        return;
      }

      await reconcileSignupRoleFromIntent({
        userId,
        requestHeaders: ctx.request?.headers ?? null,
        path: ctx.path,
      });
    }),
  },
  plugins: [
    admin({
      adminRoles: ["admin"],
      defaultRole: "student",
      roles: {
        admin: adminAc,
        expert: userAc,
        teacher: userAc,
        student: userAc,
      },
    }),
    nextCookies(),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 64,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const locale =
        readLocaleField(user, "uiLocale") ??
        readLocaleField(user, "preferredLanguage") ??
        defaultAppLocale;
      const pendingExpertInvitation = await findActivePendingExpertInvitationByEmail(user.email);
      if (pendingExpertInvitation) {
        await EmailService.sendExpertPasswordSetupEmail({
          email: user.email,
          name: normalizeExpertDisplayName(user.name),
          customUrl: url,
          locale,
        });
        return;
      }
      await EmailService.sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        token: "",
        customUrl: url,
        locale,
      });
    },
    onPasswordReset: async ({ user }) => {
      await markExpertInvitationCompleted({
        invitedUserId: user.id,
        email: user.email,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const locale =
        readLocaleField(user, "uiLocale") ??
        readLocaleField(user, "preferredLanguage") ??
        defaultAppLocale;
      const pendingExpertInvitation = await findActivePendingExpertInvitationByEmail(user.email);
      if (pendingExpertInvitation) {
        await EmailService.sendExpertInvitationVerificationEmail({
          email: user.email,
          name: normalizeExpertDisplayName(user.name),
          customUrl: url,
          locale,
        });
        return;
      }
      await EmailService.sendVerificationEmail({
        email: user.email,
        name: user.name,
        token: "",
        customUrl: url,
        locale,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: "consent",
    },
  },
  user: {
    modelName: "users",
    additionalFields: {
      role: {
        type: "string",
        required: false,
        input: false,
        returned: false,
      },
      banned: {
        type: "boolean",
        defaultValue: false,
        required: false,
        input: false,
      },
      banReason: {
        type: "string",
        required: false,
        input: false,
      },
      banExpires: {
        type: "date",
        required: false,
        input: false,
      },
      preferredLanguage: {
        type: "string",
        defaultValue: "en",
        required: false,
      },
      uiLocale: {
        type: "string",
        defaultValue: "en",
        required: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (typeof user.email === "string") {
            user.email = normalizeIdentityEmail(user.email);
          }

          const signupIntent = await readSignupRoleIntent(await headers());
          if (signupIntent) {
            user.role = signupIntent.desiredRole;
            logAuthAuditEvent("role_assignment_applied", {
              path: "/sign-up/email",
              email: user.email ?? null,
              assignedRole: user.role,
              source: "email_signup",
            });
          }

          if (user.role === "expert" || user.role === "admin") {
            logAuthAuditEvent("role_assignment_rejected", {
              path: "/sign-up/email",
              attemptedRole: user.role,
              email: user.email ?? null,
            });
            throw new Error("Privileged accounts must be provisioned by an administrator.");
          }

          return { data: user };
        },
      },
    },
  },
});

type BaseAuthUser = InferUser<typeof auth>;
type RawAuthSessionWithUser = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export type AuthUser = BaseAuthUser & {
  uiLocale?: AppLocale;
  preferredLanguage?: AppLocale;
};

export type AuthSession = InferSession<typeof auth>;

export type AuthSessionWithUser = Omit<RawAuthSessionWithUser, "user" | "session"> & {
  user: AuthUser;
  session: AuthSession;
};
