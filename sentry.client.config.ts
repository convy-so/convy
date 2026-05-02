import * as Sentry from "@sentry/nextjs";
import { clientEnv } from "@/lib/env.client";
import {
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
  parseConsentState,
} from "@/lib/privacy/shared";
import { scrubSentryEvent } from "@/lib/privacy/sentry";

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

Sentry.init({
  dsn: clientEnv.NEXT_PUBLIC_SENTRY_DSN,
  enabled: hasConsent,

  sendDefaultPii: false,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: hasConsent ? 1 : 0,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: hasConsent ? 0.1 : 0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: hasConsent ? 1.0 : 0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
