import * as Sentry from "@sentry/nextjs";

export function initializeMonitoring() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 1.0,
    });
  }
}

export function captureError(error: unknown, context?: Record<string, any>) {
  console.error(error);
  Sentry.captureException(error, {
    extra: context,
  });
}

export function captureMessage(message: string, context?: Record<string, any>) {
  console.log(message);
  Sentry.captureMessage(message, {
    extra: context,
  });
}
