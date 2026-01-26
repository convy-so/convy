"use client";

// Client-side environment variables
// These are safe to use in browser components
// They must be prefixed with NEXT_PUBLIC_

const optional = (key: string): string | undefined => {
  return process.env[key];
};

const betterAuthUrl = optional("NEXT_PUBLIC_BETTER_AUTH_URL") || "http://localhost:3000";

export const clientEnv = {
    // Better Auth
    NEXT_PUBLIC_BETTER_AUTH_URL: betterAuthUrl,

    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",

    // WebSocket
    NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL || "ws://localhost:3001",
};

export type ClientEnv = typeof clientEnv;
