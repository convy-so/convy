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

export function getAuthContinueHref(): LocalizedHref {
  return { pathname: "/auth/continue" };
}

export function getVerifyEmailHref(params: {
  locale: string;
  email: string;
  invitationId?: string | null;
}): LocalizedHref {
  return buildHref("/verify-email", {
    email: params.email,
    callbackURL: `/${params.locale}/auth/continue`,
    invitationId: params.invitationId ?? null,
  });
}
