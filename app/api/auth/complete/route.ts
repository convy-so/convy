import { NextRequest, NextResponse } from "next/server";

import { clearAuthIntentCookie } from "@/lib/auth/auth-intent";
import { sanitizeReturnTo } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const target = sanitizeReturnTo(searchParams.get("target")) ?? "/";

  await clearAuthIntentCookie();

  return NextResponse.redirect(new URL(target, request.url));
}
