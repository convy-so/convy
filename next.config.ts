import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  rewrites: async () => {
    return [
      {
        source: "/voice/:path*",
        destination: "http://localhost:3001/voice/:path*",
      },
    ];
  },
};

export default nextConfig;
