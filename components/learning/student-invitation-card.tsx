"use client";

import { GraduationCap, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type StudentInvitationCardInvitation = {
  id: string;
  classroomTitle: string;
  invitedEmail: string;
  status: string;
  expiresAt: string | null;
};

export function StudentInvitationCard({
  invitation,
  onAccept,
  onDecline,
  acceptPending,
  declinePending,
  className,
}: {
  invitation: StudentInvitationCardInvitation;
  onAccept: () => void;
  onDecline: () => void;
  acceptPending?: boolean;
  declinePending?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-600">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Classroom invite</p>
            <h3 className="mt-0.5 truncate text-sm font-semibold leading-snug text-slate-900">{invitation.classroomTitle}</h3>
            <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{invitation.invitedEmail}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
          Pending
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={acceptPending || declinePending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {acceptPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Join class
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={acceptPending || declinePending}
          className="flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {declinePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Decline
        </button>
      </div>
    </div>
  );
}
