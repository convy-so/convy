import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildAuthContinuePath,
  createAuthIntent,
  readAuthIntentCookie,
  setAuthIntentCookie,
} from "@/lib/auth/auth-intent";
import { logAuthAuditEvent } from "@/lib/auth/audit";
import { localizeAppPath, sanitizeReturnTo } from "@/lib/auth/redirect";
import { defaultAppLocale, normalizeAppLocale } from "@/lib/i18n/config";

const requestSchema = z.object({
  kind: z.enum(["direct-signup", "invite-signup", "invite-signin", "plain-signin"]),
  desiredRole: z.enum(["student", "teacher"]).nullable().optional(),
  invitationId: z.string().min(1).nullable().optional(),
  returnTo: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  preserveInviteIntent: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const body = requestSchema.parse(await request.json());
  const locale = normalizeAppLocale(body.locale, defaultAppLocale);
  const existingIntent = body.preserveInviteIntent ? await readAuthIntentCookie() : null;

  const invitationId =
    body.invitationId ??
    (existingIntent?.invitationId && existingIntent.kind.startsWith("invite-")
      ? existingIntent.invitationId
      : null);

  const desiredRole =
    body.kind.startsWith("invite-")
      ? "student"
      : body.desiredRole ??
        (existingIntent?.kind.startsWith("invite-") ? "student" : null);

  if (body.kind === "direct-signup" && !desiredRole) {
    return NextResponse.json(
      { error: "Direct sign-up requires an explicit role." },
      { status: 400 },
    );
  }

  if (body.kind.startsWith("invite-") && !invitationId) {
    return NextResponse.json(
      { error: "Invitation auth requires an invitation id." },
      { status: 400 },
    );
  }

  const defaultReturnTo = invitationId
    ? localizeAppPath(locale, `/invite/${invitationId}`)
    : null;
  const sanitizedReturnTo = sanitizeReturnTo(body.returnTo);

  if (body.returnTo && !sanitizedReturnTo) {
    logAuthAuditEvent("unsafe_redirect_target", {
      route: "/api/auth/intent",
      kind: body.kind,
      requestedReturnTo: body.returnTo,
      locale,
    });
  }

  const intent = createAuthIntent({
    kind: body.kind,
    desiredRole,
    invitationId,
    returnTo: sanitizedReturnTo ?? defaultReturnTo,
    locale,
  });

  await setAuthIntentCookie(intent);

  return NextResponse.json({
    ok: true,
    callbackURL: buildAuthContinuePath(locale),
  });
}
