import { MetadataRoute } from "next";
import { env } from "@/shared/config/server-env";

const BASE_URL = env.NEXT_PUBLIC_APP_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/settings"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
