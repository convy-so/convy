"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { clientEnv } from "./env.client";

export const authClient = createAuthClient({
  baseURL: clientEnv.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [adminClient()],
});

export type AuthClient = typeof authClient;

