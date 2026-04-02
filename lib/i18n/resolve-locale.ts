import { headers } from "next/headers";

import type { AuthSessionWithUser } from "@/lib/auth";
import {
  defaultAppLocale,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/config";
import { resolveLocaleFromAcceptLanguage } from "@/lib/i18n/accept-language";
import { getWorkspaceLocaleSettings } from "@/lib/i18n/workspace-settings";

export async function resolvePreferredUiLocale(
  session: AuthSessionWithUser | null,
): Promise<AppLocale> {
  if (isAppLocale(session?.user.uiLocale)) {
    return session.user.uiLocale;
  }

  if (isAppLocale(session?.user.preferredLanguage)) {
    return session.user.preferredLanguage;
  }

  if (session?.session.activeOrganizationId) {
    const workspaceSettings = await getWorkspaceLocaleSettings(
      session.session.activeOrganizationId,
    );
    if (workspaceSettings) {
      return workspaceSettings.defaultUiLocale;
    }
  }

  const requestHeaders = await headers();
  return resolveLocaleFromAcceptLanguage(
    requestHeaders.get("accept-language"),
  );
}

export async function resolveUiLocaleForContentCreation(params: {
  explicitLocale?: AppLocale | null;
  session: AuthSessionWithUser;
  workspaceId?: string | null;
}): Promise<AppLocale> {
  if (params.explicitLocale) {
    return params.explicitLocale;
  }

  if (params.workspaceId) {
    const workspaceSettings = await getWorkspaceLocaleSettings(params.workspaceId);
    if (workspaceSettings) {
      return workspaceSettings.defaultContentLocale;
    }
  }

  if (isAppLocale(params.session.user.uiLocale)) {
    return params.session.user.uiLocale;
  }

  if (isAppLocale(params.session.user.preferredLanguage)) {
    return params.session.user.preferredLanguage;
  }

  return defaultAppLocale;
}
