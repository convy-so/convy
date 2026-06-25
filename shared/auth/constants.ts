import { appLocales, defaultAppLocale } from "@/shared/i18n/config";

export const AUTH_INTENT_COOKIE_NAME = "convy_auth_intent";
export const AUTH_INTENT_TTL_SECONDS = 60 * 15;

export const AUTH_INTENT_KIND_VALUES = [
  "direct-signup",
  "invite-signup",
  "invite-signin",
  "plain-signin",
] as const;

export const AUTH_INTENT_ROLE_VALUES = ["student", "teacher"] as const;

export const EXPERT_INVITATION_STATUS_VALUES = [
  "pending",
  "completed",
  "cancelled",
] as const;

export const VIEWER_AREA_VALUES = [
  "teacher-dashboard",
  "student",
  "expert",
  "admin",
] as const;

export const AUTH_DEFAULTS = {
  locale: defaultAppLocale,
} as const;

export { appLocales as AUTH_SUPPORTED_LOCALES };
