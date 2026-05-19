import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Required for Docker: produces a self-contained .next/standalone/
  // server bundle that does not need the full node_modules directory.
  output: "standalone",

  // Enable React Compiler
  reactCompiler: true,
  serverExternalPackages: ["ioredis", "bullmq"],

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

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "convy-dc",

  project: "convy",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/api/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
