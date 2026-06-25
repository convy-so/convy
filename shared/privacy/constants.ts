export const CONSENT_EVIDENCE_SOURCE_VALUES = [
  "banner",
  "preferences",
  "api",
] as const;

export const CONSENT_CATEGORY_VALUES = [
  "necessary",
  "analytics",
  "marketing",
] as const;

export const PRIVACY_REQUEST_STATUS_VALUES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
] as const;

export const RESPONDENT_ACCESS_SCOPE_VALUES = [
  "respondent_self_service",
] as const;

export const PRIVACY_DEFAULTS = {
  statusPending: PRIVACY_REQUEST_STATUS_VALUES[0],
  statusInProgress: PRIVACY_REQUEST_STATUS_VALUES[1],
  statusCompleted: PRIVACY_REQUEST_STATUS_VALUES[2],
  statusFailed: PRIVACY_REQUEST_STATUS_VALUES[3],
  respondentSelfServiceScope: RESPONDENT_ACCESS_SCOPE_VALUES[0],
  attemptCount: 0,
} as const;
