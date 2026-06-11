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
  type AuthIntent,
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

function resolvePublicSignupRoleFromIntent(
  intent: AuthIntent | null | undefined,
): "student" | "teacher" | null {
  if (!intent) {
    return null;
  }

  if (intent.kind === "invite-signup") {
    return "student";
  }

  if (intent.kind === "direct-signup") {
    return intent.desiredRole;
  }

  return null;
}

export const auth = betterAuth({
  appName: "Convyy",
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: (() => {
    try {
      return [new URL(env.BETTER_AUTH_URL).origin];
    } catch {
      return [env.BETTER_AUTH_URL];
    }
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
      if (!ctx.path.startsWith("/callback/")) {
        return;
      }

      const intent = await readAuthIntentFromRequestHeaders(ctx.request?.headers ?? null);
      if (!intent || resolvePublicSignupRoleFromIntent(intent) !== "teacher") {
        return;
      }

      const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
      const userId = returned?.user?.id;
      if (!userId) {
        return;
      }

      const user = await getDb().query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user || user.role !== "student") {
        return;
      }

      if (Date.now() - user.createdAt.getTime() > 60_000) {
        return;
      }

      await getDb()
        .update(users)
        .set({
          role: "teacher",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logAuthAuditEvent("role_assignment_applied", {
        path: ctx.path,
        userId,
        assignedRole: "teacher",
        source: "social_callback",
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
        input: true,
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
        before: async (user, ctx) => {
          if (typeof user.email === "string") {
            user.email = normalizeIdentityEmail(user.email);
          }

          if (ctx?.path === "/sign-up/email") {
            const rawIntent = await readAuthIntentFromRequestHeaders(ctx.request?.headers ?? null);
            const intent = (() => {
              try {
                return validateSignupIntent(rawIntent);
              } catch (error) {
                logAuthAuditEvent("invalid_auth_intent", {
                  path: ctx.path,
                  reason: error instanceof Error ? error.message : "Unknown auth intent failure",
                  hasIntent: Boolean(rawIntent),
                  kind: rawIntent?.kind ?? null,
                  desiredRole: rawIntent?.desiredRole ?? null,
                  invitationId: rawIntent?.invitationId ?? null,
                });
                throw new Error("Missing or invalid authentication intent.");
              }
            })();

            const assignedRole = resolvePublicSignupRoleFromIntent(intent);
            if (!assignedRole) {
              throw new Error("Missing or invalid authentication intent.");
            }

            user.role = assignedRole;
            logAuthAuditEvent("role_assignment_applied", {
              path: ctx.path,
              email: user.email ?? null,
              assignedRole: user.role,
              source: "email_signup",
            });
          }

          if (ctx?.path === "/sign-up/email" && (user.role === "expert" || user.role === "admin")) {
            logAuthAuditEvent("role_assignment_rejected", {
              path: ctx.path,
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
