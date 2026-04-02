
import { enqueueEmail } from "@/lib/queue";
import { env } from "@/lib/env";
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
 * Queue workspace invitation email for background sending
 */
export async function sendWorkspaceInvitationEmail(payload: {
  email: string;
  invitedBy: string;
  workspaceName: string;
  inviteLink: string;
  locale: AppLocale;
}) {
  await enqueueEmail({
    type: "workspace-invitation",
    email: payload.email,
    url: payload.inviteLink,
    name: payload.workspaceName,
    metadata: {
      locale: payload.locale,
      invitedBy: payload.invitedBy,
      workspaceName: payload.workspaceName,
    },
  });
}

/**
 * Queue workspace welcome email (direct add)
 */
export async function sendWorkspaceWelcomeEmail(payload: {
  email: string;
  workspaceName: string;
  url: string;
  name?: string | null;
  locale?: AppLocale;
}) {
  await enqueueEmail({
    type: "workspace-welcome",
    email: payload.email,
    url: payload.url,
    name: payload.name,
    metadata: {
      locale: payload.locale,
      workspaceName: payload.workspaceName,
    },
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

/**
 * Queue survey deleted email (notify workspace members)
 */
export async function sendSurveyDeletedEmail(payload: {
  email: string;
  surveyTitle: string;
  deletedBy: string;
  workspaceName: string;
  locale?: AppLocale;
}) {
  await enqueueEmail({
    type: "survey-deleted",
    email: payload.email,
    url: env.APP_BASE_URL, // Redirect to dashboard
    name: payload.surveyTitle,
    metadata: {
      locale: payload.locale,
      deletedBy: payload.deletedBy,
      workspaceName: payload.workspaceName,
    },
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
