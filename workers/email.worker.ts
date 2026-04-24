import { MetricsTime, Worker, Job } from "bullmq";
import { Resend } from "resend";
import { z } from "zod";
import { render } from "@react-email/render";
import * as React from "react";

import type { EmailJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";
import { VerificationEmail } from "@/components/emails/verification";
import { PasswordResetEmail } from "@/components/emails/password-reset";
import { SecondaryVerificationEmail } from "@/components/emails/secondary-verification";
import { SurveyDeletedEmail } from "@/components/emails/survey-deleted";
import { StudentActivationEmail } from "@/components/emails/student-activation";
import { defaultAppLocale, normalizeAppLocale } from "@/lib/i18n/config";

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  throw new Error("RESEND_API_KEY is required for the email worker.");
}

const resend = new Resend(resendApiKey);

const jobDataSchema = z.object({
  type: z.enum([
    "verification",
    "password-reset",
    "secondary-verification",
    "survey-deleted",
    "student-activation",
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
      secondaryVerificationSubject: string;
      surveyDeletedSubject: string;
      studentActivationSubject: (classroomName: string) => string;
    }
  > = {
    en: {
      verificationSubject: "Verify your Convyy account",
      resetSubject: "Reset your Convyy password",
      secondaryVerificationSubject: "Verify your secondary email address",
      surveyDeletedSubject: "Your survey has been deleted",
      studentActivationSubject: (classroomName: string) =>
        `Activate your learning account for ${classroomName}`,
    },
    fr: {
      verificationSubject: "Verifiez votre compte Convyy",
      resetSubject: "Reinitialisez votre mot de passe Convyy",
      secondaryVerificationSubject: "Verifiez votre adresse e-mail secondaire",
      surveyDeletedSubject: "Votre sondage a ete supprime",
      studentActivationSubject: (classroomName: string) =>
        `Activez votre compte d'apprentissage pour ${classroomName}`,
    },
    de: {
      verificationSubject: "Bestaetige dein Convyy-Konto",
      resetSubject: "Setze dein Convyy-Passwort zurueck",
      secondaryVerificationSubject: "Bestaetige deine zusaetzliche E-Mail-Adresse",
      surveyDeletedSubject: "Deine Umfrage wurde geloescht",
      studentActivationSubject: (classroomName: string) =>
        `Aktiviere dein Lernkonto fuer ${classroomName}`,
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

    await job.updateProgress(30);

    let subject: string;
    let html: string;

    if (type === "verification") {
      subject = localizedCopy.verificationSubject;
      html = await render(React.createElement(VerificationEmail, { url, name }));
    } else if (type === "password-reset") {
      subject = localizedCopy.resetSubject;
      html = await render(React.createElement(PasswordResetEmail, { url, name }));
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
    } else if (type === "student-activation") {
      const classroomName = getMetadataText(
        metadata,
        "classroomName",
        "your class",
      );
      subject = localizedCopy.studentActivationSubject(classroomName);
      html = await render(
        React.createElement(StudentActivationEmail, {
          studentName: name || "there",
          classroomName,
          activationLink: url,
        }),
      );
    } else {
      throw new Error(`Unknown email type: ${type}`);
    }

    await job.updateProgress(50);

    const result = await resend.emails.send(
      {
        from: process.env.RESEND_FROM_EMAIL || "Convyy <noreply@getconvy.pro>",
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
      throw new Error(`Failed to send email: ${result.error.message}`);
    }

    await job.updateProgress(100);

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

emailWorker.on("completed", () => {});

emailWorker.on("failed", (job, err) => {
  console.error("[email-worker] job failed", {
    jobId: job?.id,
    message: err instanceof Error ? err.message : String(err),
  });
});

export default emailWorker;
