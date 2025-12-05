import "server-only";

import { enqueueEmail } from "@/lib/queue";

type EmailPayload = {
  email: string;
  url: string;
  name?: string | null;
};

/**
 * Queue verification email for background sending
 * This is now non-blocking and handled by the email worker
 */
export async function sendVerificationEmail(payload: EmailPayload) {
  await enqueueEmail({
    type: "verification",
    email: payload.email,
    url: payload.url,
    name: payload.name,
  });
}

/**
 * Queue password reset email for background sending
 * This is now non-blocking and handled by the email worker
 */
export async function sendPasswordResetEmail(payload: EmailPayload) {
  await enqueueEmail({
    type: "password-reset",
    email: payload.email,
    url: payload.url,
    name: payload.name,
  });
}
