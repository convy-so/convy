import "server-only";

import { betterAuth, InferSession, InferUser } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import { db } from "@/db";
import { authSchema } from "@/db/schema";
import { env } from "@/lib/env";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWorkspaceInvitationEmail,
} from "@/lib/email";

export const auth = betterAuth({
  appName: "Convy",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    schema: authSchema,
    provider: "pg",
  }),
  plugins: [
    nextCookies(),
    organization({
      // Allow unlimited members per workspace (for now)
      membershipLimit: Infinity,
      // Allow unlimited invitations
      invitationLimit: Infinity,
      // 7 days expiration for invitations
      invitationExpiresIn: 60 * 60 * 24 * 7,
      // Creator gets owner role
      creatorRole: "owner",
      // Send invitation emails
      async sendInvitationEmail(data) {
        const inviteLink = `${env.BETTER_AUTH_URL}/workspace/accept-invitation/${data.id}`;
        await sendWorkspaceInvitationEmail({
          email: data.email,
          invitedBy: data.inviter.user.name || data.inviter.user.email,
          workspaceName: data.organization.name,
          inviteLink,
        });
      },
    }),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 64,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({
        email: user.email,
        name: user.name,
        url,
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
        defaultValue: "user",
        required: true,
        input: false,
      },
    },
  },
});

export type AuthUser = InferUser<typeof auth>;
export type AuthSession = InferSession<typeof auth>;
export type AuthSessionWithUser = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;
