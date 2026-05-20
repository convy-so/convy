import { redirect } from "next/navigation";

import { readAuthIntentCookie } from "@/lib/auth/auth-intent";
import { getLocalizedAdminAppPath } from "@/lib/auth/admin-path";
import { getCurrentSession } from "@/lib/auth/dal";
import { findActivePendingExpertInvitationForUser } from "@/lib/auth/expert-invitations";
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

  console.log("[auth-continue] start", {
    locale: appLocale,
    hasSession: Boolean(session),
    sessionUserId: session?.user.id ?? null,
    sessionEmail: session?.user.email ?? null,
    sessionRole: session ? session.user.role : null,
    emailVerified: session?.user.emailVerified ?? null,
    intentKind: intent?.kind ?? null,
    intentInvitationId: intent?.invitationId ?? null,
    intentReturnTo: intent?.returnTo ?? null,
  });

  if (!session) {
    if (intent?.invitationId) {
      console.log("[auth-continue] redirect:no_session_student_invite", {
        invitationId: intent.invitationId,
      });
      redirectViaCompletion(localizeAppPath(appLocale, `/invite/${intent.invitationId}`));
    }
    console.log("[auth-continue] redirect:no_session_sign_in");
    redirectViaCompletion(localizeAppPath(appLocale, "/sign-in"));
  }

  if (!session.user.emailVerified) {
    console.log("[auth-continue] redirect:verify_email", {
      sessionUserId: session.user.id,
      sessionEmail: session.user.email,
      invitationId: intent?.invitationId ?? null,
    });
    redirect(buildVerifyEmailPath(appLocale, session.user.email, intent?.invitationId ?? null));
  }

  const viewerAccess = await resolveViewerAccess(session);

  if (intent?.invitationId && viewerAccess.authRole === "student") {
    console.log("[auth-continue] redirect:student_invite", {
      sessionUserId: session.user.id,
      sessionEmail: session.user.email,
      invitationId: intent.invitationId,
    });
    redirectViaCompletion(localizeAppPath(appLocale, `/invite/${intent.invitationId}`));
  }

  if (viewerAccess.authRole === "expert") {
    const pendingExpertInvitation = await findActivePendingExpertInvitationForUser({
      userId: session.user.id,
      email: session.user.email,
    });

    if (pendingExpertInvitation) {
      console.log("[auth-continue] redirect:expert_invite", {
        sessionUserId: session.user.id,
        sessionEmail: session.user.email,
        invitationId: pendingExpertInvitation.id,
      });
      redirectViaCompletion(
        localizeAppPath(appLocale, `/expert-invite/${pendingExpertInvitation.id}`),
      );
    }
  }

  const requestedTarget = sanitizeReturnTo(intent?.returnTo);
  if (requestedTarget) {
    console.log("[auth-continue] redirect:return_to", {
      sessionUserId: session.user.id,
      sessionEmail: session.user.email,
      requestedTarget,
    });
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

  console.log("[auth-continue] redirect:default_target", {
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
    defaultTarget,
  });
  redirectViaCompletion(defaultTarget);
}
