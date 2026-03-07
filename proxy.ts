import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { betterFetch } from "@better-fetch/fetch";
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
      const { data } = await betterFetch<{
        session: any;
        user: { preferredLanguage?: string };
      }>("/api/auth/get-session", {
        baseURL: process.env.BETTER_AUTH_URL || request.nextUrl.origin,
        headers: {
          // get the cookie from the request
          cookie: request.headers.get("cookie") || "",
        },
      });

      if (!data) {
        // Detect Server Action
        const isServerAction = request.headers.has("Next-Action");

        if (isServerAction) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        return NextResponse.redirect(new URL("/sign-in", request.url));
      }

      // Sync preferredLanguage with NEXT_LOCALE cookie
      const preferredLanguage = data.user.preferredLanguage;
      const currentLocale = request.cookies.get("NEXT_LOCALE")?.value;

      if (preferredLanguage && preferredLanguage !== currentLocale) {
        const response = intlMiddleware(request);
        response.cookies.set("NEXT_LOCALE", preferredLanguage, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365, // 1 year
        });
        return response;
      }
    } catch (error) {
      console.error("Auth middleware error:", error);

      // Detect Server Action
      const isServerAction = request.headers.has("Next-Action");

      if (isServerAction) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
  }

  // Run internationalization middleware
  return intlMiddleware(request);
}

export const config = {
  // Matcher excluding API, Next.js internals, and static files
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
