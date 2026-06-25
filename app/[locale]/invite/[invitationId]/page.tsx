import type { ReactNode } from "react";

import { Link } from "@/i18n/routing";

import { getCurrentSession } from "@/features/auth/public-server";
import { getSignInHref, getSignUpHref, getVerifyEmailHref } from "@/features/auth/public-server";
import { resolveInvitationAccess } from "@/features/auth/public-server";

import { InviteReviewActions } from "./invite-review-actions";

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

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ locale: string; invitationId: string }>;
}) {
  const { locale, invitationId } = await params;
  const session = await getCurrentSession();
  const state = await resolveInvitationAccess({
    invitationId,
    session,
  });

  return (
    <div className="min-h-screen bg-[#f7f8fb] px-4 py-16 sm:px-6">
      {state.kind === "not_found" ? (
        <Card title="Invitation not found">
          <p>This invitation link is unavailable or has already been removed.</p>
          <Link href="/" className="font-semibold text-slate-950 underline underline-offset-4">
            Return home
          </Link>
        </Card>
      ) : null}

      {state.kind === "pending_signed_out" ? (
        <Card title="You've been invited to a classroom">
          <p>
            Join <strong>{state.classroomTitle}</strong> with the invited email{" "}
            <strong>{state.invitedEmail}</strong>.
          </p>
          <p>Sign in if you already have a student account, or create a student account to review the invitation.</p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Link
              href={getSignInHref(state.invitationId)}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
            <Link
              href={getSignUpHref(state.invitationId)}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
            >
              Create student account
            </Link>
          </div>
        </Card>
      ) : null}

      {state.kind === "pending_review" ? (
        <Card title="Review classroom invitation">
          <p>
            You&apos;re signed in as <strong>{state.invitedEmail}</strong> and invited to join{" "}
            <strong>{state.classroomTitle}</strong>.
          </p>
          <p>Accepting adds you to the classroom. It does not change your account role.</p>
          <InviteReviewActions invitationId={state.invitationId} />
        </Card>
      ) : null}

      {state.kind === "pending_wrong_account" ? (
        <Card title="Wrong signed-in account">
          <p>
            This invitation was sent to <strong>{state.invitedEmail}</strong>, but you are signed in as{" "}
            <strong>{state.currentEmail}</strong>.
          </p>
          <p>Switch to the invited account before accepting this classroom invitation.</p>
          <Link
            href={getSignInHref(state.invitationId)}
            className="font-semibold text-slate-950 underline underline-offset-4"
          >
            Go to sign in
          </Link>
        </Card>
      ) : null}

      {state.kind === "pending_staff_blocked" ? (
        <Card title="Student invitation blocked">
          <p>
            This invitation targets a student account, but <strong>{state.currentEmail}</strong> is currently signed in as a{" "}
            <strong>{state.currentRole}</strong>.
          </p>
          <p>Teacher, expert, and admin accounts cannot accept student classroom invitations.</p>
        </Card>
      ) : null}

      {state.kind === "pending_verification" ? (
        <Card title="Verify your email first">
          <p>
            Finish verifying <strong>{state.currentEmail}</strong> before reviewing this classroom invitation.
          </p>
          <Link
            href={getVerifyEmailHref({
              locale,
              email: state.currentEmail,
              invitationId: state.invitationId,
            })}
            className="font-semibold text-slate-950 underline underline-offset-4"
          >
            Open verification page
          </Link>
        </Card>
      ) : null}

      {state.kind === "terminal" ? (
        <Card title="Invitation closed">
          <p>
            This classroom invitation is <strong>{state.reason}</strong>.
          </p>
          <p>If you still need access, ask your teacher to send a new invitation.</p>
        </Card>
      ) : null}

      {state.kind === "joined" ? (
        <Card title="You're already in this classroom">
          <p>
            You&apos;ve already joined <strong>{state.classroomTitle}</strong>.
          </p>
          <Link
            href="/student/dashboard"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Go to student dashboard
          </Link>
        </Card>
      ) : null}

      {state.kind === "unavailable" ? (
        <Card title="Invitation unavailable">
          <p>This invitation has already been consumed and cannot be used by this account.</p>
        </Card>
      ) : null}
    </div>
  );
}
