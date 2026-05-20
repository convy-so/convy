import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { Link } from "@/i18n/routing";
import { getCurrentSession } from "@/lib/auth/dal";
import {
  getExpertLoginHref,
  getVerifyEmailHref,
} from "@/lib/auth/hrefs";
import { resolveExpertInvitationAccess } from "@/lib/auth/expert-invitation-access";
import { localizeAppPath } from "@/lib/auth/redirect";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { ExpertInviteActions } from "@/components/expert/expert-invite-actions";

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-600">{children}</div>
    </div>
  );
}

export default async function ExpertInvitationPage({
  params,
}: {
  params: Promise<{ locale: string; invitationId: string }>;
}) {
  const { locale, invitationId } = await params;
  const appLocale = normalizeAppLocale(locale);
  const session = await getCurrentSession();
  const state = await resolveExpertInvitationAccess({
    invitationId,
    session,
  });

  console.log("[expert-invite-page] render", {
    invitationId,
    locale: appLocale,
    sessionUserId: session?.user.id ?? null,
    sessionEmail: session?.user.email ?? null,
    stateKind: state.kind,
  });

  if (state.kind === "completed") {
    redirect(localizeAppPath(appLocale, session ? "/expert" : "/expert-login"));
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb] px-4 py-16 sm:px-6">
      {state.kind === "not_found" ? (
        <Card title="Expert invitation not found">
          <p>This invitation link is unavailable or has already been removed.</p>
          <Link href="/" className="font-semibold text-slate-950 underline underline-offset-4">
            Return home
          </Link>
        </Card>
      ) : null}

      {state.kind === "expired" ? (
        <Card title="Invitation expired">
          <p>This expert invitation has expired.</p>
          <p>Ask an administrator to resend the invitation so you can continue onboarding.</p>
        </Card>
      ) : null}

      {state.kind === "cancelled" ? (
        <Card title="Invitation cancelled">
          <p>This expert invitation is no longer active.</p>
          <p>If you still need access, ask an administrator to create a new invitation.</p>
        </Card>
      ) : null}

      {state.kind === "pending_signed_out" ? (
        <Card title="Your expert account is ready">
          <p>
            Convyy created an expert invitation for <strong>{state.invitedEmail}</strong>.
          </p>
          <p>Sign in with that email address to continue onboarding.</p>
          <Link
            href={getExpertLoginHref()}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Go to expert login
          </Link>
        </Card>
      ) : null}

      {state.kind === "pending_wrong_account" ? (
        <Card title="Wrong signed-in account">
          <p>
            This invitation belongs to <strong>{state.invitedEmail}</strong>, but you are signed in as{" "}
            <strong>{state.currentEmail}</strong>.
          </p>
          <p>Switch to the invited expert account before continuing.</p>
          <Link
            href={getExpertLoginHref()}
            className="font-semibold text-slate-950 underline underline-offset-4"
          >
            Go to expert login
          </Link>
        </Card>
      ) : null}

      {state.kind === "pending_unverified" ? (
        <Card title="Verify your email first">
          <p>
            Verify <strong>{state.currentEmail}</strong> before completing expert onboarding.
          </p>
          <Link
            href={getVerifyEmailHref({
              locale,
              email: state.currentEmail,
              returnTo: `/${appLocale}/expert-login`,
            })}
            className="font-semibold text-slate-950 underline underline-offset-4"
          >
            Open verification page
          </Link>
        </Card>
      ) : null}

      {state.kind === "pending_password_setup" ? (
        <Card title="Finish expert onboarding">
          <p>
            Your email is verified for <strong>{state.currentEmail}</strong>.
          </p>
          <p>Send yourself a password setup email to complete activation of the expert portal.</p>
          <ExpertInviteActions invitationId={state.invitationId} />
        </Card>
      ) : null}
    </div>
  );
}
