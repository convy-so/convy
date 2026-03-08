import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse, type NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const { nextUrl } = request;

  // Check if the request is for a dashboard route
  const isDashboardRoute =
    nextUrl.pathname.startsWith("/dashboard") ||
    routing.locales.some((locale: string) =>
      nextUrl.pathname.startsWith(`/${locale}/dashboard`),
    );

  if (isDashboardRoute) {
    const sessionCookie =
      request.cookies.get("better-auth.session_token") ||
      request.cookies.get("__secure-better-auth.session_token");

    if (!sessionCookie) {
      const isServerAction = request.headers.has("Next-Action");
      if (isServerAction) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
  }

  // Enforce Locale from Cookie (Disable URL Language Override)
  const nextLocaleCookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (
    nextLocaleCookie &&
    (routing.locales as readonly string[]).includes(nextLocaleCookie)
  ) {
    const pathnameLocale = routing.locales.find(
      (locale) =>
        nextUrl.pathname === `/${locale}` ||
        nextUrl.pathname.startsWith(`/${locale}/`),
    );

    // Force the locale to match the user's saved preference preventing URL tampering
    if (pathnameLocale && pathnameLocale !== nextLocaleCookie) {
      const newPathname = nextUrl.pathname.replace(
        new RegExp(`^/${pathnameLocale}(/|$)`),
        `/${nextLocaleCookie}$1`,
      );
      const newUrl = request.nextUrl.clone();
      newUrl.pathname = newPathname;
      return NextResponse.redirect(newUrl);
    }
  }

  // Run internationalization middleware
  return intlMiddleware(request);
}

export const config = {
  // Matcher excluding API, Next.js internals, Sentry monitoring, and static files
  matcher: ["/((?!api|monitoring|_next|.*\\..*).*)"],
};
