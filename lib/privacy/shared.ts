export const CONSENT_COOKIE_NAME = "convy_privacy_consent";
export const CONSENT_COOKIE_VERSION = 1;

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentState = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
  version: number;
};

export const defaultConsentState = (): ConsentState => ({
  necessary: true,
  analytics: false,
  marketing: false,
  updatedAt: new Date().toISOString(),
  version: CONSENT_COOKIE_VERSION,
});

export function serializeConsentState(state: ConsentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function parseConsentState(value: string | null | undefined): ConsentState | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ConsentState>;
    if (
      parsed.version !== CONSENT_COOKIE_VERSION ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return {
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      updatedAt: parsed.updatedAt,
      version: CONSENT_COOKIE_VERSION,
    };
  } catch {
    return null;
  }
}

export function buildConsentState(input: {
  analytics: boolean;
  marketing: boolean;
}): ConsentState {
  return {
    necessary: true,
    analytics: input.analytics,
    marketing: input.marketing,
    updatedAt: new Date().toISOString(),
    version: CONSENT_COOKIE_VERSION,
  };
}

export function hasAnalyticsConsent(state: ConsentState | null | undefined) {
  return Boolean(state?.analytics);
}

export function hasMarketingConsent(state: ConsentState | null | undefined) {
  return Boolean(state?.marketing);
}

export function consentStateFromCookieString(cookieString: string | null | undefined) {
  if (!cookieString) return null;

  const prefix = `${CONSENT_COOKIE_NAME}=`;
  const value = cookieString
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);

  return parseConsentState(value);
}
