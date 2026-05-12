import { betterAuth, InferSession, InferUser } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";

import { getDb } from "@/db";
import { authSchema } from "@/db/schema";
import { env } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/config";
import { defaultAppLocale, isAppLocale } from "@/lib/i18n/config";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email";

function readLocaleField(
  value: object,
  fieldName: "uiLocale" | "preferredLanguage",
): AppLocale | undefined {
  const candidate = Reflect.get(value, fieldName);
  return isAppLocale(candidate) ? candidate : undefined;
}

const pendingRoles = new Map<string, string>();

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
    before: async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const body = ctx.body as any;
        if (body && body.email && body.role) {
          pendingRoles.set(body.email.toLowerCase(), body.role);
          delete body.role;
        }
      }
      return { context: ctx };
    }
  },
  plugins: [
    admin({
      adminRoles: ["admin"],
      defaultRole: "teacher",
      adminUserIds: env.ADMIN_USER_IDS,
    }),
    nextCookies(),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 64,
    requireEmailVerification: true,
    customSyntheticUser: ({
      coreFields,
      additionalFields,
      id,
    }: {
      coreFields: Record<string, unknown>;
      additionalFields: Record<string, unknown>;
      id: string;
    }) => ({
      ...coreFields,
      role: (coreFields.role as string) || "student",
      banned: false,
      banReason: null,
      banExpires: null,
      ...additionalFields,
      id,
    }),
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const locale =
        readLocaleField(user, "uiLocale") ??
        readLocaleField(user, "preferredLanguage") ??
        defaultAppLocale;
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        url,
        locale,
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
      await sendVerificationEmail({
        email: user.email,
        name: user.name,
        url,
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
    fields: {
      role: {
        input: false,
      }
    },
    additionalFields: {
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
          if (user.email && env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            throw new Error("Admin emails cannot be registered as normal users.");
          }

          const cachedRole = user.email ? pendingRoles.get(user.email.toLowerCase()) : null;
          if (cachedRole) {
             user.role = cachedRole;
             pendingRoles.delete(user.email.toLowerCase());
          }

          if (user.role === "expert" || user.role === "admin") {
             throw new Error("Privileged accounts must be provisioned by an administrator.");
          }

          return { data: user };
        }
      }
    }
  }
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
