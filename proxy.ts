import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
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
    const sessionCookie =
      request.cookies.get("better-auth.session_token") ||
      request.cookies.get("__secure-better-auth.session_token");

    if (!sessionCookie) {
      // Detect Server Action
      const isServerAction = request.headers.has("Next-Action");

      if (isServerAction) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    // Since we are downstream in a Server Component (Layout/Page),
    // the actual cryptographic verification happens there via auth.api.getSession().
    // We only perform an "Optimistic" check here to keep the middleware thin and prevent loops.
  }

  // Run internationalization middleware
  return intlMiddleware(request);
}

export const config = {
  // Matcher excluding API, Next.js internals, Sentry monitoring, and static files
  matcher: ["/((?!api|monitoring|_next|.*\\..*).*)"],
};
