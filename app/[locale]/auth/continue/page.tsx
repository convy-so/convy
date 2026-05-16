import { redirect } from "next/navigation";

import { readAuthIntentCookie } from "@/lib/auth/auth-intent";
import { getLocalizedAdminAppPath } from "@/lib/auth/admin-path";
import { getCurrentSession } from "@/lib/auth/dal";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { resolveViewerAccess } from "@/lib/auth/viewer-access";
import { localizeAppPath } from "@/lib/auth/redirect";
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n/config";

function redirectViaCompletion(target: string): never {
  redirect(`/api/auth/complete?target=${encodeURIComponent(target)}`);
}

function buildVerifyEmailPath(
  locale: AppLocale,
  email: string,
  invitationId: string | null,
) {
  const params = new URLSearchParams();
  params.set("email", email);
  params.set("callbackURL", `/${locale}/auth/continue`);
  if (invitationId) {
    params.set("invitationId", invitationId);
  }
  return `${localizeAppPath(locale, "/verify-email")}?${params.toString()}`;
}

export default async function AuthContinuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const appLocale = normalizeAppLocale(locale);
  const session = await getCurrentSession();
  const intent = await readAuthIntentCookie();

  if (!session) {
    if (intent?.invitationId) {
      redirectViaCompletion(localizeAppPath(appLocale, `/invite/${intent.invitationId}`));
    }
    redirectViaCompletion(localizeAppPath(appLocale, "/sign-in"));
  }

  if (!session.user.emailVerified) {
    redirect(buildVerifyEmailPath(appLocale, session.user.email, intent?.invitationId ?? null));
  }

  const viewerAccess = await resolveViewerAccess(session);

  if (intent?.invitationId && viewerAccess.authRole === "student") {
    redirectViaCompletion(localizeAppPath(appLocale, `/invite/${intent.invitationId}`));
  }

  const requestedTarget = sanitizeReturnTo(intent?.returnTo);
  if (requestedTarget) {
    redirectViaCompletion(requestedTarget);
  }

  const defaultTarget =
    viewerAccess.authRole === "student"
      ? localizeAppPath(appLocale, "/student/dashboard")
      : viewerAccess.authRole === "teacher"
        ? localizeAppPath(appLocale, "/dashboard")
        : viewerAccess.authRole === "expert"
          ? localizeAppPath(appLocale, "/expert")
          : getLocalizedAdminAppPath(appLocale);

  redirectViaCompletion(defaultTarget);
}
