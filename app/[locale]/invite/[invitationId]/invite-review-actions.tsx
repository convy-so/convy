"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";

import { respondToInvitationAction } from "@/app/actions/classroom/student-actions";
import { useRouter } from "@/i18n/routing";

export function InviteReviewActions({
  invitationId,
}: {
  invitationId: string;
}) {
  const router = useRouter();
  const [activeDecision, setActiveDecision] = useState<"accepted" | "rejected" | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(decision: "accepted" | "rejected") {
    setActiveDecision(decision);
    startTransition(async () => {
      const result = await respondToInvitationAction({ invitationId, decision });
      if (!result.success) {
        toast.error("Unable to update the invitation right now.");
        setActiveDecision(null);
        return;
      }

      toast.success(decision === "accepted" ? "Invitation accepted." : "Invitation declined.");
      router.replace(`/invite/${invitationId}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={() => submit("accepted")}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending && activeDecision === "accepted" ? "Accepting..." : "Accept invitation"}
      </button>
      <button
        type="button"
        onClick={() => submit("rejected")}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        {isPending && activeDecision === "rejected" ? "Declining..." : "Decline"}
      </button>
    </div>
  );
}
