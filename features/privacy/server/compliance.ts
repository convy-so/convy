import crypto from "node:crypto";

import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { consentEvents } from "@/shared/db/schema";
import { env } from "@/shared/config/server-env";
import {
  getEnabledSubprocessorIds,
  getRuntimeProcessorViolations,
} from "@/features/privacy/server/subprocessors";

export function hashPrivacyValue(value: string) {
  const hmac = crypto.createHmac(
    "sha256",
    env.GDPR_PRIVACY_SECRET || env.BETTER_AUTH_SECRET,
  );
  hmac.update(value);
  return hmac.digest("hex");
}

export function truncateIpAddress(value: string | null | undefined) {
  if (!value) return null;
  if (value.includes(":")) {
    return value.split(":").slice(0, 4).join(":");
  }

  const parts = value.split(".");
  if (parts.length !== 4) return value;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

export function hashIpAddress(value: string | null | undefined) {
  const truncated = truncateIpAddress(value);
  return truncated ? hashPrivacyValue(truncated) : null;
}

export async function recordConsentEvent(input: {
  surveyId?: string | null;
  userId?: string | null;
  subjectType: string;
  subjectId?: string | null;
  consentKey: string;
  decision: string;
  locale?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  evidence: {
    source: "banner" | "preferences" | "api";
    categories: Array<"necessary" | "analytics" | "marketing">;
  };
}) {
  await getDb().insert(consentEvents).values({
    id: nanoid(),
    surveyId: input.surveyId ?? null,
    userId: input.userId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    consentKey: input.consentKey,
    decision: input.decision,
    locale: input.locale ?? null,
    ipHash: hashIpAddress(input.ipAddress),
    userAgent: input.userAgent ?? null,
    evidence: input.evidence,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export function getRuntimeProcessorHealth() {
  const violations = getRuntimeProcessorViolations();
  return {
    ok: violations.length === 0,
    enabledProcessors: getEnabledSubprocessorIds(),
    approvedProcessors: env.GDPR_EU_APPROVED_PROCESSORS,
    violations,
  };
}
