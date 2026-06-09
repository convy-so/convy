"use client";

type PrepareAuthIntentInput = {
  kind: "direct-signup" | "invite-signup" | "invite-signin" | "plain-signin";
  desiredRole?: "student" | "teacher" | null;
  invitationId?: string | null;
  returnTo?: string | null;
  locale?: string | null;
  preserveInviteIntent?: boolean;
};

export async function prepareAuthIntent(input: PrepareAuthIntentInput): Promise<string> {
  const response = await fetch("/api/auth/intent", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    callbackURL?: string;
    error?: string;
  };

  if (!response.ok || !payload.callbackURL) {
    throw new Error(payload.error || "Failed to prepare authentication intent.");
  }

  return payload.callbackURL;
}
