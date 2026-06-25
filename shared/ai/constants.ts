export const EXPERT_GUIDANCE_STATUS_VALUES = [
  "draft",
  "approved",
  "archived",
] as const;

export const EXPERT_GUIDANCE_TARGET_SCOPE_VALUES = ["global"] as const;

export const FEW_SHOT_OWNED_BY_ROLE_VALUES = ["expert"] as const;

export const AI_DEFAULTS = {
  draftStatus: EXPERT_GUIDANCE_STATUS_VALUES[0],
  targetScopeGlobal: EXPERT_GUIDANCE_TARGET_SCOPE_VALUES[0],
  initialVersion: 1,
  retrievalContent: "",
  ownedByRoleExpert: FEW_SHOT_OWNED_BY_ROLE_VALUES[0],
} as const;
