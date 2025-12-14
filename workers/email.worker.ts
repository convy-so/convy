import { Worker, Job } from "bullmq";
import { Resend } from "resend";
import { z } from "zod";

import type { EmailJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const resend = new Resend(process.env.RESEND_API_KEY!);

const jobDataSchema = z.object({
  type: z.enum(["verification", "password-reset"]),
  email: z.string().email(),
  url: z.string().url(),
  name: z.string().nullable().optional(),
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
      `[Email Worker] Processing job ${job.id} - ${type} email to ${email}`
    );

    await job.updateProgress(30);

    let subject: string;
    let text: string;

    if (type === "verification") {
      subject = "Verify your Convy account";
      text = [
        `Hi ${name ?? "there"},`,
        "",
        "Please confirm your email address to start using Convy.",
        url,
        "",
        "If you didn't request this, you can ignore this email.",
      ].join("\n");
    } else if (type === "password-reset") {
      subject = "Reset your Convy password";
      text = [
        `Hi ${name ?? "there"},`,
        "",
        "You recently requested to reset your Convy password.",
        "Click the link below to choose a new one:",
        url,
        "",
        "This link will expire soon. If you didn't request a reset, you can ignore this email.",
      ].join("\n");
    } else {
      throw new Error(`Unknown email type: ${type}`);
    }

    await job.updateProgress(50);

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: email,
      subject,
      text,
    });

    if (result.error) {
      throw new Error(`Failed to send email: ${result.error.message}`);
    }

    await job.updateProgress(100);

    console.log(
      `[Email Worker] Completed job ${job.id} - ${type} email to ${email}`
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
  }
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

// Note: Signal handlers are managed by the main index.ts when running all workers together
// Individual signal handlers removed to prevent conflicts

export default emailWorker;
