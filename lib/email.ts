
import { enqueueEmail } from "@/lib/queue";
import type { AppLocale } from "@/lib/i18n/config";

type EmailPayload = {
  email: string;
  url: string;
  name?: string | null;
  locale?: AppLocale;
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
    metadata: payload.locale ? { locale: payload.locale } : undefined,
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
    metadata: payload.locale ? { locale: payload.locale } : undefined,
  });
}

/**
 * Queue secondary email verification
 */
export async function sendSecondaryEmailVerification(payload: {
  email: string;
  url: string;
  name?: string | null;
  locale?: AppLocale;
}) {
  await enqueueEmail({
    type: "secondary-verification",
    email: payload.email,
    url: payload.url,
    name: payload.name,
    metadata: payload.locale ? { locale: payload.locale } : undefined,
  });
}

export async function sendStudentActivationEmail(payload: {
  email: string;
  studentName: string;
  classroomName: string;
  activationLink: string;
  locale?: AppLocale;
}) {
  await enqueueEmail({
    type: "student-activation",
    email: payload.email,
    url: payload.activationLink,
    name: payload.studentName,
    metadata: {
      locale: payload.locale,
      classroomName: payload.classroomName,
    },
  });
}
