import { headers } from "next/headers";
import { betterAuth, InferSession, InferUser } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { authSchema, users } from "@/db/schema";
import {
  normalizeIdentityEmail,
  readAuthIntentFromRequestHeaders,
  validateSignupIntent,
} from "@/lib/auth/auth-intent";
import { logAuthAuditEvent } from "@/lib/auth/audit";
import {
  findActivePendingExpertInvitationByEmail,
  markExpertInvitationCompleted,
} from "@/lib/auth/expert-invitations";
import { normalizeExpertDisplayName } from "@/lib/auth/expert-profile";
import { env } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/config";
import { defaultAppLocale, isAppLocale } from "@/lib/i18n/config";
import { EmailService } from "@/lib/email-service";

function readLocaleField(
  value: object,
  fieldName: "uiLocale" | "preferredLanguage",
): AppLocale | undefined {
  const candidate = Reflect.get(value, fieldName);
  return isAppLocale(candidate) ? candidate : undefined;
}

function isMutableRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
        let intent;
        try {
          intent = validateSignupIntent(rawIntent);
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
        const body = ctx.body;
        if (isMutableRecord(body)) {
          if (typeof Reflect.get(body, "email") === "string") {
            Reflect.set(body, "email", normalizeIdentityEmail(String(Reflect.get(body, "email"))));
          }
          Reflect.deleteProperty(body, "role");
        }
      }

      if (ctx.path === "/sign-in/email" || ctx.path === "/send-verification-email") {
        const body = ctx.body;
        if (isMutableRecord(body) && typeof Reflect.get(body, "email") === "string") {
          Reflect.set(body, "email", normalizeIdentityEmail(String(Reflect.get(body, "email"))));
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

      const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
      const userId = returned?.user?.id;
      if (!userId) {
        return;
      }

      await reconcileSignupRoleFromIntent({
        userId,
        requestHeaders: ctx.request?.headers ?? null,
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
