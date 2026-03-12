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

const resend = new Resend(process.env.RESEND_API_KEY!);

const jobDataSchema = z.object({
  type: z.enum([
    "verification",
    "password-reset",
    "workspace-invitation",
    "workspace-welcome",
    "secondary-verification",
    "survey-deleted",
  ]),
  email: z.string().email(),
  url: z.string(),
  name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Worker for sending emails
 * Handles verification and password reset emails
 */
const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job: Job<EmailJobData>) => {
    const validatedData = jobDataSchema.parse(job.data);
    const { type, email, url, name } = validatedData;

    console.log(
      `[Email Worker] Processing job ${job.id} - ${type} email to ${email}`,
    );

    await job.updateProgress(30);

    let subject: string;
    let html: string;

    if (type === "verification") {
      subject = "Verify your Convyy account";
      html = await render(
        React.createElement(VerificationEmail, { url, name })
      );
    } else if (type === "password-reset") {
      subject = "Reset your Convyy password";
      html = await render(
        React.createElement(PasswordResetEmail, { url, name })
      );
    } else if (type === "workspace-invitation") {
      const workspaceName = (validatedData.metadata?.workspaceName as string) || "a workspace";
      const invitedBy = (validatedData.metadata?.invitedBy as string) || "someone";
      subject = `You've been invited to join ${workspaceName} on Convyy`;
      html = await render(
        React.createElement(WorkspaceInvitationEmail, {
          invitedBy,
          workspaceName,
          inviteLink: url,
          name
        })
      );
    } else if (type === "workspace-welcome") {
      const workspaceName = (validatedData.metadata?.workspaceName as string) || "the workspace";
      subject = `Welcome to ${workspaceName} on Convyy`;
      html = await render(
        React.createElement(WorkspaceWelcomeEmail, {
          workspaceName,
          url,
          name
        })
      );
    } else if (type === "secondary-verification") {
      subject = "Verify your secondary email address";
      html = await render(
        React.createElement(SecondaryVerificationEmail, { url, name })
      );
    } else if (type === "survey-deleted") {
      const surveyTitle = (validatedData.metadata?.surveyTitle as string) || "your survey";
      const deletedBy = (validatedData.metadata?.deletedBy as string) || "someone";
      const workspaceName = (validatedData.metadata?.workspaceName as string) || "the workspace";
      subject = "Your survey has been deleted";
      
      html = await render(
        React.createElement(SurveyDeletedEmail, {
          surveyTitle,
          deletedBy,
          workspaceName,
          url,
          name
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

    console.log(
      `[Email Worker] Completed job ${job.id} - ${type} email to ${email}`,
    );

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

emailWorker.on("completed", (job) => {
  console.log(`[Email Worker] Job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[Email Worker] Job ${job?.id} failed:`, err.message);
});

emailWorker.on("error", (err) => {
  console.error("[Email Worker] Worker error:", err);
});

export default emailWorker;
