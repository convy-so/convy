import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Required for Docker: produces a self-contained .next/standalone/
  // server bundle that does not need the full node_modules directory.
  output: "standalone",

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

export default withNextIntl(nextConfig);
