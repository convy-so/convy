"use server";

import { getVerifiedSession } from "@/lib/auth/session";
import {
  conversationInsightsQueue,
  surveyAnalyticsQueue,
  sampleConversationInsightsQueue,
  emailQueue,
} from "@/lib/queue";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type JobStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed";

export interface JobInfo {
  id: string;
  name: string;
  data: Record<string, unknown>;
  progress: number;
  state: JobStatus;
  timestamp: number;
  finishedOn?: number;
  processedOn?: number;
  failedReason?: string;
  returnvalue?: unknown;
}

/**
 * Get job status by ID
 * This allows frontend to poll for job completion
 */
export async function getJobStatusAction(
  jobId: string,
  queueName:
    | "conversation-insights"
    | "survey-analytics"
    | "sample-conversation-insights"
    | "email"
): Promise<ActionResult<JobInfo>> {
  try {
    await getVerifiedSession();

    let queue;
    switch (queueName) {
      case "conversation-insights":
        queue = conversationInsightsQueue;
        break;
      case "survey-analytics":
        queue = surveyAnalyticsQueue;
        break;
      case "sample-conversation-insights":
        queue = sampleConversationInsightsQueue;
        break;
      case "email":
        queue = emailQueue;
        break;
      default:
        return { success: false, error: "Invalid queue name" };
    }

    const job = await queue.getJob(jobId);

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const state = await job.getState();
    const progress = job.progress as number;

    // Map BullMQ JobState to our JobStatus type
    const mappedState: JobStatus =
      state === "waiting-children" || state === "prioritized"
        ? "waiting"
        : state === "unknown"
          ? "failed"
          : state;

    return {
      success: true,
      data: {
        id: job.id!,
        name: job.name,
        data: job.data as unknown as Record<string, unknown>,
        progress,
        state: mappedState,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn ?? undefined,
        processedOn: job.processedOn ?? undefined,
        failedReason: job.failedReason,
        returnvalue: job.returnvalue,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to get job status" };
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStatsAction(
  queueName:
    | "conversation-insights"
    | "survey-analytics"
    | "sample-conversation-insights"
    | "email"
): Promise<
  ActionResult<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>
> {
  try {
    await getVerifiedSession();

    let queue;
    switch (queueName) {
      case "conversation-insights":
        queue = conversationInsightsQueue;
        break;
      case "survey-analytics":
        queue = surveyAnalyticsQueue;
        break;
      case "sample-conversation-insights":
        queue = sampleConversationInsightsQueue;
        break;
      case "email":
        queue = emailQueue;
        break;
      default:
        return { success: false, error: "Invalid queue name" };
    }

    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    );

    return {
      success: true,
      data: counts as {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to get queue stats" };
  }
}

/**
 * Retry a failed job
 */
export async function retryJobAction(
  jobId: string,
  queueName:
    | "conversation-insights"
    | "survey-analytics"
    | "sample-conversation-insights"
    | "email"
): Promise<ActionResult<{ success: boolean }>> {
  try {
    await getVerifiedSession();

    let queue;
    switch (queueName) {
      case "conversation-insights":
        queue = conversationInsightsQueue;
        break;
      case "survey-analytics":
        queue = surveyAnalyticsQueue;
        break;
      case "sample-conversation-insights":
        queue = sampleConversationInsightsQueue;
        break;
      case "email":
        queue = emailQueue;
        break;
      default:
        return { success: false, error: "Invalid queue name" };
    }

    const job = await queue.getJob(jobId);

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const state = await job.getState();

    if (state !== "failed") {
      return { success: false, error: "Only failed jobs can be retried" };
    }

    await job.retry();

    return {
      success: true,
      data: { success: true },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to retry job" };
  }
}
