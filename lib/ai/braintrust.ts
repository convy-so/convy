type BraintrustTraceInput = {
  event: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  scores?: Record<string, number>;
};

let cachedLogger: Promise<unknown | null> | null = null;

async function loadBraintrustLogger() {
  if (cachedLogger) {
    return cachedLogger;
  }

  cachedLogger = (async () => {
    const projectName = process.env.BRAINTRUST_PROJECT_NAME;
    if (!projectName) {
      return null;
    }

    try {
      const importer = new Function("return import('braintrust')") as () => Promise<{
        initLogger?: (args: { projectName: string }) => unknown;
      }>;
      const braintrust = await importer();
      if (typeof braintrust.initLogger !== "function") {
        return null;
      }

      return braintrust.initLogger({ projectName });
    } catch {
      return null;
    }
  })();

  return cachedLogger;
}

export async function logBraintrustTrace(input: BraintrustTraceInput) {
  const logger = await loadBraintrustLogger();
  if (!logger || typeof logger !== "object" || logger === null) {
    return;
  }

  const logFn = (logger as { log?: (payload: Record<string, unknown>) => Promise<unknown> | unknown }).log;
  if (typeof logFn !== "function") {
    return;
  }

  await logFn({
    input: input.input ?? {},
    output: input.output ?? {},
    metadata: {
      event: input.event,
      ...(input.metadata ?? {}),
    },
    scores: input.scores ?? {},
  });
}
