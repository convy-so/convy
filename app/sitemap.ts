import { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://getconvy.pro";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/privacy", "/terms"];
  const locales = routing.locales;

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // Add all localized pages
  for (const locale of locales) {
    for (const route of routes) {
      const url = `${BASE_URL}/${locale}${route}`;

      sitemapEntries.push({
        url,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: route === "" ? 1 : 0.8,
        alternates: {
          languages: locales.reduce<Record<string, string>>(
            (acc, l) => {
              acc[l] = `${BASE_URL}/${l}${route}`;
              return acc;
            },
            {},
          ),
        },
      });
    }
  }

  return sitemapEntries;
}
