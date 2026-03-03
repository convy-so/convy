import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "better-auth/types";
import { NextResponse, type NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const { nextUrl } = request;

  // Check if the request is for a dashboard route
  // This includes both direct /dashboard and localized /:locale/dashboard
  const isDashboardRoute =
    nextUrl.pathname.startsWith("/dashboard") ||
    routing.locales.some((locale: string) =>
      nextUrl.pathname.startsWith(`/${locale}/dashboard`),
    );

  if (isDashboardRoute) {
    try {
      const { data: session } = await betterFetch<Session>(
        "/api/auth/get-session",
        {
          baseURL: process.env.BETTER_AUTH_URL || request.nextUrl.origin,
          headers: {
            // get the cookie from the request
            cookie: request.headers.get("cookie") || "",
          },
        },
      );

      if (!session) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
    } catch (error) {
      console.error("Auth middleware error:", error);
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
  }

  // Run internationalization middleware
  return intlMiddleware(request);
}

export const config = {
  // Matcher excluding API, Next.js internals, Sentry monitoring, and static files
  matcher: ["/((?!api|monitoring|_next|.*\\..*).*)"],
};
