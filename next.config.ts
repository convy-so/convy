import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
  rewrites: async () => {
    return [
      {
        source: "/voice/:path*",
        destination: `${process.env.NEXT_PUBLIC_WEBSOCKET_URL?.replace("ws://", "http://").replace("wss://", "https://") || "http://localhost:3001"}/voice/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
