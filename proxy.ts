import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse, type NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

  // Check if the request is for a dashboard route
  // This includes both direct /dashboard and localized /:locale/dashboard
  const isDashboardRoute =
    pathname.startsWith("/dashboard") ||
    routing.locales.some((locale: string) =>
      pathname.startsWith(`/${locale}/dashboard`),
    );

  // Detect the current locale from the URL segment (e.g., /en/dashboard -> en)
  const urlLocale = routing.locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (isDashboardRoute) {
    // 1. Optimistic Auth Check (Cookie-only)
    // Better Auth default session cookie name contains "session_token"
    const hasSessionCookie = request.cookies
      .getAll()
      .some((cookie) => cookie.name.includes("session_token"));

    if (!hasSessionCookie) {
      // If no session cookie, redirect to sign-in immediately
      // Use the detected locale or default to 'en'
      const redirectLocale = urlLocale || routing.defaultLocale;
      
      // Detect Server Action
      if (request.headers.has("Next-Action")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL(`/${redirectLocale}/sign-in`, request.url));
    }

    // 2. Optimistic Locale Sync (Fast Cache)
    // Use NEXT_LOCALE cookie as the fast source of truth for the Proxy layer
    const nextLocaleCookie = request.cookies.get("NEXT_LOCALE")?.value;

    if (nextLocaleCookie && nextLocaleCookie !== urlLocale) {
      // Construct new URL with the correct locale
      const newPathname = urlLocale
        ? pathname.replace(`/${urlLocale}`, `/${nextLocaleCookie}`)
        : `/${nextLocaleCookie}${pathname}`;

      const response = NextResponse.redirect(new URL(newPathname, request.url));

      // Ensure the cookie is refreshed
      response.cookies.set("NEXT_LOCALE", nextLocaleCookie, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });

      return response;
    }
  }

  // Run internationalization middleware (handles locale detection and default routing)
  return intlMiddleware(request);
}

export const config = {
  // Matcher excluding API, Next.js internals, Sentry monitoring, and static files
  matcher: ["/((?!api|monitoring|_next|.*\\..*).*)"],
};
