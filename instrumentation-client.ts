// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { clientEnv } from "@/lib/env.client";
import {
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
  parseConsentState,
} from "@/lib/privacy/shared";

function readConsentFromDocumentCookie() {
  if (typeof document === "undefined") {
    return null;
  }

  const raw = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE_NAME}=`))
    ?.slice(`${CONSENT_COOKIE_NAME}=`.length);

  return parseConsentState(raw);
}

const consentState = readConsentFromDocumentCookie();
const hasConsent =
  !clientEnv.NEXT_PUBLIC_GDPR_EU_MODE || hasAnalyticsConsent(consentState);
const allowReplay = hasConsent;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: hasConsent,

  // Add optional integrations for additional features
  integrations: allowReplay ? [Sentry.replayIntegration()] : [],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: hasConsent ? 1 : 0,
  // Enable logs to be sent to Sentry
  enableLogs: hasConsent,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: allowReplay ? 0.1 : 0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: allowReplay ? 1.0 : 0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
