import { Worker, Job } from "bullmq";
import { Resend } from "resend";
import { z } from "zod";
import { render } from "@react-email/render";
import * as React from "react";

import type { EmailJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

// Email Templates
import { VerificationEmail } from "@/components/emails/verification";
import { PasswordResetEmail } from "@/components/emails/password-reset";
import { WorkspaceInvitationEmail } from "@/components/emails/workspace-invitation";
import { WorkspaceWelcomeEmail } from "@/components/emails/workspace-welcome";
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
    "workspace-invitation",
    "workspace-welcome",
    "secondary-verification",
    "survey-deleted",
    "student-activation",
  ]),
  email: z.string().email(),
  url: z.string(),
  name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
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
      invitationSubject: (workspaceName: string) => string;
      welcomeSubject: (workspaceName: string) => string;
      secondaryVerificationSubject: string;
      surveyDeletedSubject: string;
      studentActivationSubject: (classroomName: string) => string;
    }
  > = {
    en: {
      verificationSubject: "Verify your Convyy account",
      resetSubject: "Reset your Convyy password",
      invitationSubject: (workspaceName: string) =>
        `You've been invited to join ${workspaceName} on Convyy`,
      welcomeSubject: (workspaceName: string) =>
        `Welcome to ${workspaceName} on Convyy`,
      secondaryVerificationSubject: "Verify your secondary email address",
      surveyDeletedSubject: "Your survey has been deleted",
      studentActivationSubject: (classroomName: string) =>
        `Activate your learning account for ${classroomName}`,
    },
    fr: {
      verificationSubject: "Vérifiez votre compte Convyy",
      resetSubject: "Réinitialisez votre mot de passe Convyy",
      invitationSubject: (workspaceName: string) =>
        `Vous êtes invité à rejoindre ${workspaceName} sur Convyy`,
      welcomeSubject: (workspaceName: string) =>
        `Bienvenue dans ${workspaceName} sur Convyy`,
      secondaryVerificationSubject: "Vérifiez votre adresse e-mail secondaire",
      surveyDeletedSubject: "Votre sondage a été supprimé",
      studentActivationSubject: (classroomName: string) =>
        `Activez votre compte d'apprentissage pour ${classroomName}`,
    },
    de: {
      verificationSubject: "Bestätige dein Convyy-Konto",
      resetSubject: "Setze dein Convyy-Passwort zurück",
      invitationSubject: (workspaceName: string) =>
        `Du wurdest eingeladen, ${workspaceName} auf Convyy beizutreten`,
      welcomeSubject: (workspaceName: string) =>
        `Willkommen bei ${workspaceName} auf Convyy`,
      secondaryVerificationSubject: "Bestätige deine zusätzliche E-Mail-Adresse",
      surveyDeletedSubject: "Deine Umfrage wurde gelöscht",
      studentActivationSubject: (classroomName: string) =>
        `Aktiviere dein Lernkonto für ${classroomName}`,
    },
    es: {
      verificationSubject: "Verifica tu cuenta de Convyy",
      resetSubject: "Restablece tu contraseña de Convyy",
      invitationSubject: (workspaceName: string) =>
        `Te invitaron a unirte a ${workspaceName} en Convyy`,
      welcomeSubject: (workspaceName: string) =>
        `Te damos la bienvenida a ${workspaceName} en Convyy`,
      secondaryVerificationSubject: "Verifica tu dirección de correo secundaria",
      surveyDeletedSubject: "Tu encuesta ha sido eliminada",
      studentActivationSubject: (classroomName: string) =>
        `Activa tu cuenta de aprendizaje para ${classroomName}`,
    },
    it: {
      verificationSubject: "Verifica il tuo account Convyy",
      resetSubject: "Reimposta la password di Convyy",
      invitationSubject: (workspaceName: string) =>
        `Sei stato invitato a unirti a ${workspaceName} su Convyy`,
      welcomeSubject: (workspaceName: string) =>
        `Benvenuto in ${workspaceName} su Convyy`,
      secondaryVerificationSubject: "Verifica il tuo indirizzo email secondario",
      surveyDeletedSubject: "Il tuo sondaggio è stato eliminato",
      studentActivationSubject: (classroomName: string) =>
        `Attiva il tuo account di apprendimento per ${classroomName}`,
    },
  };

  return copy[locale];
}

/**
 * Worker for sending emails
 * Handles verification and password reset emails
 */
const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job: Job<EmailJobData>) => {
    const validatedData = jobDataSchema.parse(job.data);
    const { type, email, url, name } = validatedData;
    const metadata = validatedData.metadata;
    const locale = getMetadataLocale(metadata);
    const localizedCopy = getLocalizedEmailCopy(locale);


    await job.updateProgress(30);

    let subject: string;
    let html: string;

    if (type === "verification") {
      subject = localizedCopy.verificationSubject;
      html = await render(
        React.createElement(VerificationEmail, { url, name })
      );
    } else if (type === "password-reset") {
      subject = localizedCopy.resetSubject;
      html = await render(
        React.createElement(PasswordResetEmail, { url, name })
      );
    } else if (type === "workspace-invitation") {
      const workspaceName = getMetadataText(metadata, "workspaceName", "a workspace");
      const invitedBy = getMetadataText(metadata, "invitedBy", "someone");
      subject = localizedCopy.invitationSubject(workspaceName);
      html = await render(
        React.createElement(WorkspaceInvitationEmail, {
          invitedBy,
          workspaceName,
          inviteLink: url,
          name
        })
      );
    } else if (type === "workspace-welcome") {
      const workspaceName = getMetadataText(metadata, "workspaceName", "the workspace");
      subject = localizedCopy.welcomeSubject(workspaceName);
      html = await render(
        React.createElement(WorkspaceWelcomeEmail, {
          workspaceName,
          url,
          name
        })
      );
    } else if (type === "secondary-verification") {
      subject = localizedCopy.secondaryVerificationSubject;
      html = await render(
        React.createElement(SecondaryVerificationEmail, { url, name })
      );
    } else if (type === "survey-deleted") {
      const surveyTitle = getMetadataText(metadata, "surveyTitle", "your survey");
      const deletedBy = getMetadataText(metadata, "deletedBy", "someone");
      const workspaceName = getMetadataText(metadata, "workspaceName", "the workspace");
      subject = localizedCopy.surveyDeletedSubject;
      
      html = await render(
        React.createElement(SurveyDeletedEmail, {
          surveyTitle,
          deletedBy,
          workspaceName,
          url,
          name
        })
      );
    } else if (type === "student-activation") {
      const classroomName = getMetadataText(metadata, "classroomName", "your class");
      subject = localizedCopy.studentActivationSubject(classroomName);
      html = await render(
        React.createElement(StudentActivationEmail, {
          studentName: name || "there",
          classroomName,
          activationLink: url,
        })
      );
    } else {
      throw new Error(`Unknown email type: ${type}`);
    }

    await job.updateProgress(50);

    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Convyy <noreply@getconvy.pro>",
      to: email,
      subject,
      html,
    });

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
  },
);

emailWorker.on("completed", () => {
});

emailWorker.on("failed", (job, err) => {
});

emailWorker.on("error", (err) => {
});

export default emailWorker;

