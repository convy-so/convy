import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentSession } from "@/lib/auth/session";
import { recordConsentEvent } from "@/lib/privacy/compliance";
import {
  CONSENT_COOKIE_NAME,
  buildConsentState,
  serializeConsentState,
} from "@/lib/privacy/shared";
import { env } from "@/lib/env";

const bodySchema = z.object({
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
  locale: z.string().optional(),
});

export async function POST(request: Request) {
  const body = bodySchema.parse(await request.json());
  const session = await getCurrentSession();
  const state = buildConsentState({
    analytics: body.analytics,
    marketing: body.marketing,
  });

  await recordConsentEvent({
    userId: session?.user.id ?? null,
    subjectType: session ? "user" : "browser",
    subjectId: session?.user.id ?? null,
    consentKey: "cookie_preferences",
    decision: body.analytics || body.marketing ? "granted" : "denied",
    locale: body.locale ?? null,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent"),
    evidence: {
      source: "banner",
      categories: [
        "necessary",
        ...(body.analytics ? (["analytics"] as const) : []),
        ...(body.marketing ? (["marketing"] as const) : []),
      ],
    },
  });

  const response = NextResponse.json({
    success: true,
    consent: state,
  });

  response.cookies.set(CONSENT_COOKIE_NAME, serializeConsentState(state), {
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
    httpOnly: false,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });

  return response;
}
