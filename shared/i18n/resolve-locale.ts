import { headers } from "next/headers";

import type { AuthSessionWithUser } from "@/features/auth/public-server";
import {
  defaultAppLocale,
  isAppLocale,
  type AppLocale,
} from "@/shared/i18n/config";
import { resolveLocaleFromAcceptLanguage } from "@/shared/i18n/accept-language";

export async function resolvePreferredUiLocale(
  session: AuthSessionWithUser | null,
): Promise<AppLocale> {
  if (isAppLocale(session?.user.uiLocale)) {
    return session.user.uiLocale;
  }

  if (isAppLocale(session?.user.preferredLanguage)) {
    return session.user.preferredLanguage;
  }

  const requestHeaders = await headers();
  return resolveLocaleFromAcceptLanguage(
    requestHeaders.get("accept-language"),
  );
}

export function resolveUiLocaleForContentCreation(params: {
  explicitLocale?: AppLocale | null;
  session: AuthSessionWithUser;
}): AppLocale {
  if (params.explicitLocale) {
    return params.explicitLocale;
  }

  if (isAppLocale(params.session.user.uiLocale)) {
    return params.session.user.uiLocale;
  }

  if (isAppLocale(params.session.user.preferredLanguage)) {
    return params.session.user.preferredLanguage;
  }

  return defaultAppLocale;
}
