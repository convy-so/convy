import "server-only";

import { Resend } from "resend";

import { env } from "@/lib/env";

const resend = new Resend(env.RESEND_API_KEY);

type VerificationPayload = {
  email: string;
  url: string;
  username?: string | null;
};

export async function sendVerificationEmail({
  email,
  url,
  username,
}: VerificationPayload) {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: "Verify your Convy account",
    text: [
      `Hi ${username ?? "there"},`,
      "",
      "Please confirm your email address to start using Convy.",
      url,
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
  });
}

