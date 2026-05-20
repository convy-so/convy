import { sanitizeReturnTo } from "@/lib/auth/redirect";

type HrefQuery = Record<string, string>;

type LocalizedHref = {
  pathname: string;
  query?: HrefQuery;
};

function buildHref(pathname: string, query?: Record<string, string | null | undefined>): LocalizedHref {
  if (!query) {
    return { pathname };
  }

  const filteredEntries = Object.entries(query).filter((entry): entry is [string, string] => {
    const [, value] = entry;
    return typeof value === "string" && value.length > 0;
  });

  if (filteredEntries.length === 0) {
    return { pathname };
  }

  return {
    pathname,
    query: Object.fromEntries(filteredEntries),
  };
}

export function getSignInHref(invitationId?: string | null): LocalizedHref {
  return buildHref("/sign-in", { invitationId });
}

export function getSignUpHref(invitationId?: string | null): LocalizedHref {
  return buildHref("/sign-up", { invitationId });
}

export function getExpertLoginHref(returnTo?: string | null): LocalizedHref {
  return buildHref("/expert-login", { returnTo });
}

export function getAuthContinueHref(): LocalizedHref {
  return { pathname: "/auth/continue" };
}

export function getSafeReturnToHref(
  returnTo: string | null | undefined,
): LocalizedHref | null {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (!safeReturnTo) {
    return null;
  }

  const url = new URL(safeReturnTo, "https://local.invalid");
  const pathname = stripLocalePrefix(url.pathname);
  const query = Object.fromEntries(url.searchParams.entries());

  return buildHref(pathname, query);
}

export function getVerifyEmailHref(params: {
  locale: string;
  email: string;
  invitationId?: string | null;
  returnTo?: string | null;
}): LocalizedHref {
  return buildHref("/verify-email", {
    email: params.email,
    callbackURL: `/${params.locale}/auth/continue`,
    invitationId: params.invitationId ?? null,
    returnTo: params.returnTo ?? null,
  });
}

function stripLocalePrefix(path: string): string {
  const segments = path.split("/");
  const maybeLocale = segments[1];

  if (maybeLocale === "en" || maybeLocale === "fr" || maybeLocale === "de") {
    return `/${segments.slice(2).join("/")}`.replace(/\/+$/, "") || "/";
  }

  return path.replace(/\/+$/, "") || "/";
}
