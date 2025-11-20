import "server-only";

import { Resend } from "resend";

import { env } from "@/lib/env";

const resend = new Resend(env.RESEND_API_KEY);

type EmailPayload = {
  email: string;
  url: string;
  username?: string | null;
};

export async function sendVerificationEmail(payload: EmailPayload) {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: payload.email,
    subject: "Verify your Convy account",
    text: [
      `Hi ${payload.username ?? "there"},`,
      "",
      "Please confirm your email address to start using Convy.",
      payload.url,
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
  });
}

export async function sendPasswordResetEmail(payload: EmailPayload) {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: payload.email,
    subject: "Reset your Convy password",
    text: [
      `Hi ${payload.username ?? "there"},`,
      "",
      "You recently requested to reset your Convy password.",
      "Click the link below to choose a new one:",
      payload.url,
      "",
      "This link will expire soon. If you didn't request a reset, you can ignore this email.",
    ].join("\n"),
  });
}
