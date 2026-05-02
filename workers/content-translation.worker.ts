import { MetricsTime, Worker, Job } from "bullmq";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import { getRedisClient } from "@/lib/redis";
import type { ContentTranslationJobData } from "@/lib/queue";
import { isAppLocale } from "@/lib/i18n/config";
import { translateDynamicField } from "@/lib/i18n/dynamic-translations";

const jobDataSchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  field: z.string().min(1),
  sourceLocale: z.string().min(2),
  targetLocale: z.string().min(2),
  sourceText: z.string(),
  context: z.string().optional(),
});

const contentTranslationWorker = new Worker<ContentTranslationJobData>(
  "content-translation",
  async (job: Job<ContentTranslationJobData>) => {
    const validated = jobDataSchema.parse(job.data);

    if (
      !isAppLocale(validated.sourceLocale) ||
      !isAppLocale(validated.targetLocale)
    ) {
      throw new Error("Unsupported locale for content translation.");
    }

    const translated = await translateDynamicField({
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      field: validated.field,
      sourceLocale: validated.sourceLocale,
      targetLocale: validated.targetLocale,
      sourceText: validated.sourceText,
      context: validated.context,
    });

    return {
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      field: validated.field,
      targetLocale: validated.targetLocale,
      translated,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 3,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2,
    },
  },
);

contentTranslationWorker.on("failed", (job, err) => {
  Sentry.logger.error("Content translation worker job failed", {
    service: "content-translation-worker",
    job_id: job?.id ?? "",
    resource_type: job?.data?.resourceType ?? "",
    resource_id: job?.data?.resourceId ?? "",
    error_message: err instanceof Error ? err.message : String(err),
  });
});

export default contentTranslationWorker;
