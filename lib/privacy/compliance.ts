import crypto from "node:crypto";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  consentEvents,
  retentionPolicies,
  type RetentionPolicySettings,
  type WorkspacePrivacyProfileSettings,
  workspacePrivacyProfiles,
} from "@/db/schema";
import { env } from "@/lib/env";
import { getEnabledSubprocessorIds, getRuntimeProcessorViolations } from "@/lib/privacy/subprocessors";

export const defaultRetentionPolicySettings: RetentionPolicySettings = {
  rawTranscriptDays: 30,
  voiceTelemetryDays: 7,
  derivedAnalyticsDays: 180,
  studentInteractionDays: 90,
  privacyRequestDays: 365,
};

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

export function createDefaultWorkspacePrivacySettings(): WorkspacePrivacyProfileSettings {
  return {
    controllerIdentity: null,
    controllerContactName: null,
    controllerContactEmail: null,
    dpoContactEmail: null,
    privacyNoticeUrl: null,
    privacyNoticeText: null,
    processorRoleAcknowledged: false,
    enabledProcessors: getEnabledSubprocessorIds(),
    lawfulBasisDeclarations: [],
    dataResidencyMode: "eea_only",
    audienceAgeMode: "unset",
  };
}

export async function ensureWorkspacePrivacyProfile(organizationId: string) {
  const existing = await getDb().query.workspacePrivacyProfiles.findFirst({
    where: eq(workspacePrivacyProfiles.organizationId, organizationId),
  });
  if (existing) return existing;

  const [created] = await getDb()
    .insert(workspacePrivacyProfiles)
    .values({
      id: nanoid(),
      organizationId,
      regionCode: "eu",
      isEuWorkspace: env.GDPR_EU_MODE,
      settings: createDefaultWorkspacePrivacySettings(),
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function ensureWorkspaceRetentionPolicy(organizationId: string) {
  const existing = await getDb().query.retentionPolicies.findFirst({
    where: eq(retentionPolicies.organizationId, organizationId),
  });
  if (existing) return existing;

  const [created] = await getDb()
    .insert(retentionPolicies)
    .values({
      id: nanoid(),
      organizationId,
      settings: defaultRetentionPolicySettings,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export function getWorkspacePrivacyProfileMissingItems(input: {
  settings: WorkspacePrivacyProfileSettings | null | undefined;
  retentionSettings: RetentionPolicySettings | null | undefined;
  requireAgeMode?: boolean;
}) {
  const missing: string[] = [];
  const settings = input.settings;

  if (!settings) {
    return ["privacy_profile"];
  }

  if (!settings.controllerIdentity?.trim()) missing.push("controllerIdentity");
  if (!settings.controllerContactEmail?.trim()) missing.push("controllerContactEmail");
  if (
    !settings.privacyNoticeUrl?.trim() &&
    !settings.privacyNoticeText?.trim()
  ) {
    missing.push("privacyNotice");
  }
  if (!settings.processorRoleAcknowledged) missing.push("processorRoleAcknowledged");
  if (!Array.isArray(settings.lawfulBasisDeclarations) || settings.lawfulBasisDeclarations.length === 0) {
    missing.push("lawfulBasisDeclarations");
  }
  if (!Array.isArray(settings.enabledProcessors) || settings.enabledProcessors.length === 0) {
    missing.push("enabledProcessors");
  }
  if (settings.dataResidencyMode !== "eea_only") {
    missing.push("dataResidencyMode");
  }
  if (input.requireAgeMode && settings.audienceAgeMode === "unset") {
    missing.push("audienceAgeMode");
  }
  if (!input.retentionSettings) {
    missing.push("retentionPolicy");
  }

  const enabledRuntimeProcessors = getEnabledSubprocessorIds();
  const enabledProcessorSet = new Set(settings.enabledProcessors);
  for (const processorId of enabledRuntimeProcessors) {
    if (!enabledProcessorSet.has(processorId)) {
      missing.push(`enabledProcessor:${processorId}`);
    }
  }

  return Array.from(new Set(missing));
}

export async function assertWorkspacePrivacyReadiness(input: {
  organizationId: string | null | undefined;
  requireAgeMode?: boolean;
}) {
  if (!env.GDPR_EU_MODE || !input.organizationId) {
    return;
  }

  const [profile, retention] = await Promise.all([
    ensureWorkspacePrivacyProfile(input.organizationId),
    ensureWorkspaceRetentionPolicy(input.organizationId),
  ]);

  const missing = getWorkspacePrivacyProfileMissingItems({
    settings: profile.settings,
    retentionSettings: retention.settings,
    requireAgeMode: input.requireAgeMode,
  });

  if (missing.length > 0) {
    const error = new Error(
      `GDPR workspace privacy profile is incomplete: ${missing.join(", ")}`,
    );
    error.name = "GDPR_WORKSPACE_PRIVACY_INCOMPLETE";
    throw error;
  }
}

export async function getWorkspacePrivacyState(organizationId: string) {
  const [profile, retention] = await Promise.all([
    ensureWorkspacePrivacyProfile(organizationId),
    ensureWorkspaceRetentionPolicy(organizationId),
  ]);
  const runtimeEnabledProcessors = getEnabledSubprocessorIds();
  const runtimeProcessorViolations = getRuntimeProcessorViolations();

  return {
    profile,
    retention,
    missingItems: getWorkspacePrivacyProfileMissingItems({
      settings: profile.settings,
      retentionSettings: retention.settings,
      requireAgeMode: true,
    }),
    runtimeEnabledProcessors,
    runtimeProcessorViolations,
  };
}

export async function recordConsentEvent(input: {
  organizationId?: string | null;
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
    organizationId: input.organizationId ?? null,
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

export async function getWorkspaceAudienceAgeMode(organizationId: string | null | undefined) {
  if (!organizationId) return "unset" as const;

  const profile = await ensureWorkspacePrivacyProfile(organizationId);
  return profile.settings.audienceAgeMode;
}
