/**
 * Experiment Evaluation Worker — Nightly Scheduled Job
 *
 * Runs every night at 3 AM UTC. Performs:
 *  1. Pattern lifecycle evaluation (CANDIDATE→SHADOW→IN_EXPERIMENT promotions, degraded ACTIVE→DEPRECATED)
 *  2. A/B experiment evaluation (statistical analysis → promote winners, deprecate losers)
 */

import { Worker, Job } from "bullmq";
import { getRedisClient } from "@/lib/redis";
import { runLifecycleEvaluator } from "@/lib/learning/pattern-lifecycle";
import { evaluateExperiments } from "@/lib/learning/experiment-engine";

const experimentEvaluationWorker = new Worker(
  "experiment-evaluation",
  async (job: Job) => {
    console.log(`[ExperimentEvaluationWorker] Starting nightly evaluation job ${job.id}`);

    await job.updateProgress(10);

    // Run pattern lifecycle (CANDIDATE→SHADOW→IN_EXPERIMENT, ACTIVE→DEPRECATED)
    const lifecycleReport = await runLifecycleEvaluator();
    await job.updateProgress(60);

    // Evaluate active A/B experiments
    const experimentReport = await evaluateExperiments();
    await job.updateProgress(100);

    const summary = {
      lifecycle: lifecycleReport,
      experiments: experimentReport,
      ranAt: new Date().toISOString(),
    };

    console.log(`[ExperimentEvaluationWorker] Nightly evaluation complete:`, summary);
    return summary;
  },
  {
    connection: getRedisClient(),
    concurrency: 1, // Only ever one nightly job at a time
  }
);

experimentEvaluationWorker.on("completed", (job) =>
  console.log(`[ExperimentEvaluationWorker] Job ${job.id} completed`)
);
experimentEvaluationWorker.on("failed", (job, err) =>
  console.error(`[ExperimentEvaluationWorker] Job ${job?.id} failed:`, err.message)
);
experimentEvaluationWorker.on("error", (err) =>
  console.error("[ExperimentEvaluationWorker] Worker error:", err)
);

export default experimentEvaluationWorker;
