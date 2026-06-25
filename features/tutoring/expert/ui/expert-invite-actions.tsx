"use client";

import { useState } from "react";

import toast from "react-hot-toast";
import { Loader2, Mail } from "lucide-react";
import { readJsonResponseValue } from "@/shared/http/json";

type ExpertInviteActionsProps = {
  invitationId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(value: unknown): string {
  if (!isRecord(value)) {
    return "Unable to send the password setup email.";
  }

  const error = value.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return "Unable to send the password setup email.";
}

export function ExpertInviteActions({ invitationId }: ExpertInviteActionsProps) {
  const [isSending, setIsSending] = useState(false);
  const [name, setName] = useState("");

  async function handleSendPasswordSetup() {
    if (!name.trim()) {
      toast.error("Enter your name to continue.");
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch(`/api/expert-invitations/${invitationId}/password-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
        }),
      });
      const payload = await readJsonResponseValue(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      toast.success("Password setup email sent.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send the password setup email.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="expert-name"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Full name
        </label>
        <input
          id="expert-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your full name"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          disabled={isSending}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          void handleSendPasswordSetup();
        }}
        disabled={isSending}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Save name and send password setup email
      </button>
    </div>
  );
}
