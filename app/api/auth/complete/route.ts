import { NextRequest, NextResponse } from "next/server";

import { clearAuthIntentCookie } from "@/features/auth/public-server";
import { resolvePublicRedirectUrl } from "@/features/auth/public-server";
import { sanitizeReturnTo } from "@/features/auth/public-server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const target = sanitizeReturnTo(searchParams.get("target")) ?? "/";

  await clearAuthIntentCookie();

  return NextResponse.redirect(resolvePublicRedirectUrl(target));
}
