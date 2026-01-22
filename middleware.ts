import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "better-auth/types";
import { NextResponse, type NextRequest } from "next/server";

export default async function authMiddleware(request: NextRequest) {
    const { nextUrl } = request;
    const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard");

    if (isDashboardRoute) {
        try {
            const { data: session } = await betterFetch<Session>(
                "/api/auth/get-session",
                {
                    baseURL: request.nextUrl.origin,
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
            // On error, better to be safe and redirect or let it pass? 
            // Usually redirect to sign-in if we can't verify session.
            return NextResponse.redirect(new URL("/sign-in", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard/:path*"],
};
