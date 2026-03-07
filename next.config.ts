import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Required for Docker: produces a self-contained .next/standalone/
  // server bundle that does not need the full node_modules directory.
  output: "standalone",

  // Enable Next.js 16 Cache Components and React Compiler
  cacheComponents: true,
  reactCompiler: true,

  // Explicitly set Turbopack root to the project directory to avoid root inference issues
  turbopack: {
    root: process.cwd(),
  },

  rewrites: async () => {
    // Proxy /voice/* and /analytics WebSocket upgrade requests
    // from the Next.js server to the standalone WebSocket container.
    // ALB routes HTTP(S) here; the WS server upgrades the connection.
    const wsHttpBase =
      process.env.NEXT_PUBLIC_WEBSOCKET_URL?.replace(
        "ws://",
        "http://",
      ).replace("wss://", "https://") ?? "http://localhost:3001";

    return [
      {
        source: "/voice/:path*",
        destination: `${wsHttpBase}/voice/:path*`,
      },
      {
        source: "/analytics",
        destination: `${wsHttpBase}/analytics`,
      },
    ];
  },
};

// Sentry configuration is disabled for now to allow for fast deployment.
// To re-enable, wrap the exported config with 'withSentryConfig'.
/*
const sentryConfig = withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  reactComponentAnnotation: {
    enabled: true,
  },
  tunnelRoute: "/monitoring",
  disableLogger: true,
  automaticVercelMonitors: true,
});
*/

export default withNextIntl(nextConfig);
