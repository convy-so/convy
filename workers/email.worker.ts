import { MetricsTime, Worker, Job } from "bullmq";
import { Resend } from "resend";
import { z } from "zod";
import { render } from "@react-email/render";
import * as React from "react";
import * as Sentry from "@sentry/node";

import type { EmailJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";
import { VerificationEmail } from "@/components/emails/verification";
import { PasswordResetEmail } from "@/components/emails/password-reset";
import { ExpertInvitationVerificationEmail } from "@/components/emails/expert-invitation-verification";
import { ExpertPasswordSetupEmail } from "@/components/emails/expert-password-setup";
import { SecondaryVerificationEmail } from "@/components/emails/secondary-verification";
import { SurveyDeletedEmail } from "@/components/emails/survey-deleted";
import { StudentInvitationEmail } from "@/components/emails/student-invitation";
import { defaultAppLocale, normalizeAppLocale } from "@/lib/i18n/config";
import { env } from "@/lib/env";

const resendApiKey = env.RESEND_API_KEY;

if (!resendApiKey) {
  throw new Error("RESEND_API_KEY is required for the email worker.");
}

const resend = new Resend(resendApiKey);

const jobDataSchema = z.object({
  type: z.enum([
    "verification",
    "password-reset",
    "expert-invitation-verification",
    "expert-password-setup",
    "secondary-verification",
    "survey-deleted",
    "student-invitation",
  ]),
  email: z.string().email(),
  url: z.string(),
  name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

function getMetadataText(
  metadata: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function getMetadataLocale(metadata: Record<string, unknown> | undefined) {
  return normalizeAppLocale(metadata?.locale, defaultAppLocale);
}

function getLocalizedEmailCopy(locale: ReturnType<typeof getMetadataLocale>) {
  const copy: Record<
    ReturnType<typeof getMetadataLocale>,
    {
      verificationSubject: string;
      resetSubject: string;
      expertInvitationVerificationSubject: string;
      expertPasswordSetupSubject: string;
      secondaryVerificationSubject: string;
      surveyDeletedSubject: string;
      studentInvitationSubject: (classroomName: string) => string;
    }
  > = {
    en: {
      verificationSubject: "Verify your Convyy account",
      resetSubject: "Reset your Convyy password",
      expertInvitationVerificationSubject: "Verify your Convyy expert invitation",
      expertPasswordSetupSubject: "Set your Convyy expert password",
      secondaryVerificationSubject: "Verify your secondary email address",
      surveyDeletedSubject: "Your survey has been deleted",
      studentInvitationSubject: (classroomName: string) =>
        `You have been invited to join ${classroomName}`,
    },
    fr: {
      verificationSubject: "Verifiez votre compte Convyy",
      resetSubject: "Reinitialisez votre mot de passe Convyy",
      expertInvitationVerificationSubject: "Verifiez votre invitation expert Convyy",
      expertPasswordSetupSubject: "Definissez votre mot de passe expert Convyy",
      secondaryVerificationSubject: "Verifiez votre adresse e-mail secondaire",
      surveyDeletedSubject: "Votre sondage a ete supprime",
      studentInvitationSubject: (classroomName: string) =>
        `Vous avez été invité à rejoindre ${classroomName}`,
    },
    de: {
      verificationSubject: "Bestaetige dein Convyy-Konto",
      resetSubject: "Setze dein Convyy-Passwort zurueck",
      expertInvitationVerificationSubject: "Bestaetige deine Convyy-Experteneinladung",
      expertPasswordSetupSubject: "Lege dein Convyy-Expertenpasswort fest",
      secondaryVerificationSubject: "Bestaetige deine zusaetzliche E-Mail-Adresse",
      surveyDeletedSubject: "Deine Umfrage wurde geloescht",
      studentInvitationSubject: (classroomName: string) =>
        `Du wurdest eingeladen, ${classroomName} beizutreten`,
    },
  };

  return copy[locale];
}

const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job: Job<EmailJobData>) => {
    const validatedData = jobDataSchema.parse(job.data);
    const { type, email, url, name, idempotencyKey } = validatedData;
    const metadata = validatedData.metadata;
    const locale = getMetadataLocale(metadata);
    const localizedCopy = getLocalizedEmailCopy(locale);

    console.log(`[email-worker] Processing job`, {
      jobId: job.id,
      type,
      email,
      locale,
      idempotencyKey,
      attempt: job.attemptsMade + 1,
    });

    await job.updateProgress(30);

    let subject: string;
    let html: string;

    if (type === "verification") {
      subject = localizedCopy.verificationSubject;
      html = await render(React.createElement(VerificationEmail, { url, name }));
    } else if (type === "password-reset") {
      subject = localizedCopy.resetSubject;
      html = await render(React.createElement(PasswordResetEmail, { url, name }));
    } else if (type === "expert-invitation-verification") {
      subject = localizedCopy.expertInvitationVerificationSubject;
      html = await render(
        React.createElement(ExpertInvitationVerificationEmail, { url, name }),
      );
    } else if (type === "expert-password-setup") {
      subject = localizedCopy.expertPasswordSetupSubject;
      html = await render(
        React.createElement(ExpertPasswordSetupEmail, { url, name }),
      );
    } else if (type === "secondary-verification") {
      subject = localizedCopy.secondaryVerificationSubject;
      html = await render(
        React.createElement(SecondaryVerificationEmail, { url, name }),
      );
    } else if (type === "survey-deleted") {
      subject = localizedCopy.surveyDeletedSubject;
      html = await render(
        React.createElement(SurveyDeletedEmail, {
          surveyTitle: getMetadataText(metadata, "surveyTitle", "your survey"),
          deletedBy: getMetadataText(metadata, "deletedBy", "someone"),
          dashboardLabel: getMetadataText(
            metadata,
            "dashboardLabel",
            "your dashboard",
          ),
          url,
          name,
        }),
      );
    } else if (type === "student-invitation") {
      const classroomName = getMetadataText(
        metadata,
        "classroomName",
        "your class",
      );
      subject = localizedCopy.studentInvitationSubject(classroomName);
      html = await render(
        React.createElement(StudentInvitationEmail, {
          classroomName,
          inviteLink: url,
        }),
      );
    } else {
      throw new Error(`Unknown email type: ${type}`);
    }

    await job.updateProgress(50);

    console.log(`[email-worker] Calling Resend API`, {
      jobId: job.id,
      type,
      to: email,
      from: env.RESEND_FROM_EMAIL,
      subject,
      idempotencyKey: idempotencyKey ?? "(none)",
    });

    const result = await resend.emails.send(
      {
        from: env.RESEND_FROM_EMAIL,
        to: email,
        subject,
        html,
      },
      idempotencyKey
        ? {
            idempotencyKey,
          }
        : undefined,
    );

    if (result.error) {
      // Log the full Resend error object so we can debug it locally
      console.error(`[email-worker] Resend API returned an error`, {
        jobId: job.id,
        type,
        to: email,
        resendError: result.error,
        // Resend errors have a `name` and `message` field
        errorName: (result.error as { name?: string }).name,
        errorMessage: result.error.message,
      });
      throw new Error(`Resend rejected the email: [${(result.error as { name?: string }).name ?? "unknown"}] ${result.error.message}`);
    }

    await job.updateProgress(100);

    console.log(`[email-worker] Email sent successfully`, {
      jobId: job.id,
      type,
      to: email,
      resendMessageId: result.data?.id,
    });

    return {
      type,
      email,
      messageId: result.data?.id,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 60000,
    },
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2,
    },
  },
);

emailWorker.on("completed", (job, result) => {
  console.log(`[email-worker] Job completed`, {
    jobId: job.id,
    type: result?.type,
    to: result?.email,
    resendMessageId: result?.messageId,
  });
});

emailWorker.on("failed", (job, err) => {
  console.error(`[email-worker] Job FAILED`, {
    jobId: job?.id,
    jobName: job?.name,
    type: job?.data?.type,
    to: job?.data?.email,
    attempt: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts,
    errorMessage: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  Sentry.logger.error("Email worker job failed", {
    service: "email-worker",
    job_id: job?.id ?? "",
    job_type: job?.data?.type ?? "",
    recipient: job?.data?.email ?? "",
    error_message: err instanceof Error ? err.message : String(err),
  });
});

export default emailWorker;
