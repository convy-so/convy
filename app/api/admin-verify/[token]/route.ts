import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import {
  consumeAdminLoginToken,
  createAdminSession,
  getAdminSessionCookieConfig,
} from "@/lib/admin/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.redirect(`${env.APP_BASE_URL}/`);
  }

  const email = await consumeAdminLoginToken(token);

  if (!email) {
    return NextResponse.redirect(`${env.APP_BASE_URL}/`);
  }

  const sessionToken = await createAdminSession(email);
  const response = NextResponse.redirect(
    `${env.APP_BASE_URL}/en/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI`,
  );
  response.cookies.set("admin_session", sessionToken, getAdminSessionCookieConfig());
  response.headers.set("Cache-Control", "no-store");

  return response;
}
