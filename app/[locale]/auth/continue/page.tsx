import { redirect } from "next/navigation";

import { readAuthIntentCookie } from "@/lib/auth/auth-intent";
import { getLocalizedAdminAppPath } from "@/lib/auth/admin-path";
import { getCurrentSession } from "@/lib/auth/dal";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { resolveViewerAccess } from "@/lib/auth/viewer-access";
import { localizeAppPath } from "@/lib/auth/redirect";
import { normalizeAppLocale } from "@/lib/i18n/config";

function redirectViaCompletion(target: string): never {
  redirect(`/api/auth/complete?target=${encodeURIComponent(target)}`);
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
    redirect(`${localizeAppPath(appLocale, "/verify-email")}?email=${encodeURIComponent(session.user.email)}`);
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
