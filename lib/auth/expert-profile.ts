import "server-only";

export const PENDING_EXPERT_NAME = "__pending_expert_name__";

export function buildPendingExpertName() {
  return PENDING_EXPERT_NAME;
}

export function isPendingExpertName(value: string | null | undefined) {
  return !value || value.trim().length === 0 || value === PENDING_EXPERT_NAME;
}

export function normalizeExpertDisplayName(value: string | null | undefined) {
  return isPendingExpertName(value) ? null : value!.trim();
}
