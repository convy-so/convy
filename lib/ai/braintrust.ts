import { initLogger } from "braintrust";
import * as Sentry from "@sentry/nextjs";

type BraintrustTraceInput = {
  event: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  scores?: Record<string, number>;
};

let cachedLogger: ReturnType<typeof initLogger> | null = null;

function getBraintrustLogger(): ReturnType<typeof initLogger> | null {
  const projectName = process.env.BRAINTRUST_PROJECT_NAME;
  if (!projectName) {
    return null;
  }

  if (!cachedLogger) {
    cachedLogger = initLogger({ projectName });
  }

  return cachedLogger;
}

export async function logBraintrustTrace(input: BraintrustTraceInput) {
  const logger = getBraintrustLogger();
  if (!logger) {
    return;
  }

  try {
    await logger.log({
      input: input.input ?? {},
      output: input.output ?? {},
      metadata: {
        event: input.event,
        ...(input.metadata ?? {}),
      },
      scores: input.scores ?? {},
    });
  } catch (error) {
    Sentry.captureException(error);
  }
}
