"use client";

/**
 * Better Auth Client
 * 
 * Client-side authentication and workspace management
 */

import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "/api/auth",
  plugins: [organizationClient()],
});

export type AuthClient = typeof authClient;

