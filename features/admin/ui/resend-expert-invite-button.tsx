"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import toast from "react-hot-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { readJsonResponseValue } from "@/shared/http/json";

type ResendExpertInviteButtonProps = {
  invitationId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResponseErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return null;
}

export function ResendExpertInviteButton({
  invitationId,
}: ResendExpertInviteButtonProps) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [, startTransition] = useTransition();

  async function handleResend() {
    setIsSending(true);
    try {
      const response = await fetch(`/api/admin/experts/${invitationId}/resend`, {
        method: "POST",
      });
      const payload = await readJsonResponseValue(response);

      if (!response.ok) {
        throw new Error(
          getResponseErrorMessage(payload) ?? "Unable to resend the invitation.",
        );
      }

      toast.success("Expert invitation resent.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to resend the invitation.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleResend();
      }}
      disabled={isSending}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isSending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      Resend invite
    </button>
  );
}
