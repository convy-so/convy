import { initLogger } from "braintrust";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/shared/config/server-env";

type BraintrustTraceInput = {
  event: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  scores?: Record<string, number>;
};

function getBraintrustLogger(): ReturnType<typeof initLogger> | null {
  const projectName = env.BRAINTRUST_PROJECT_NAME;
  if (!projectName) {
    return null;
  }
  return initLogger({ projectName });
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
