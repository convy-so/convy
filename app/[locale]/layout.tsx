import type { Metadata } from "next";
import localFont from "next/font/local";
import "../globals.css";
import { Toaster } from "react-hot-toast";
import Providers from "../providers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Suspense } from "react";
import { CookieConsent } from "@/components/cookie-consent";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://convy.ai";

const aspekta = localFont({
  src: [
    {
      path: "../../public/fonts/Aspekta-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-aspekta",
});

const fasthand = localFont({
  src: [
    {
      path: "../../assets/fonts/Fasthand-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../assets/fonts/Fasthand-latin-ext.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-fasthand",
});

import { SupportedLanguage } from "@/lib/i18n/ai-translator";

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de"
  );
}

function isRoutingLocale(
  value: string,
): value is (typeof routing.locales)[number] {
  return routing.locales.some((locale) => locale === value);
}

const METADATA_CONFIG: Record<SupportedLanguage, { title: string; description: string }> = {
  en: {
    title: "Convyy — AI Tutoring Infrastructure for Schools",
    description: "Launch adaptive tutoring, expert-guided pedagogy, and evidence-backed learning workflows in one AI-native platform.",
  },
  fr: {
    title: "Convyy — Infrastructure de tutorat IA pour les écoles",
    description: "Déployez un tutorat adaptatif, une pédagogie guidée par des experts et des workflows d'apprentissage pilotés par des preuves.",
  },
  de: {
    title: "Convyy — KI-Tutoring-Infrastruktur für Schulen",
    description: "Starten Sie adaptives Tutoring, expertengesteuerte Didaktik und evidenzbasierte Lern-Workflows auf einer KI-nativen Plattform.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = isSupportedLanguage(locale) ? locale : "en";
  const { title, description } = METADATA_CONFIG[lang] || METADATA_CONFIG.en;

  return {
    title,
    description,
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://convy.ai"),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        fr: "/fr",
        de: "/de",
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/${locale}`,
      siteName: "Convyy",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    keywords: [
      "AI tutoring",
      "adaptive learning",
      "school AI platform",
      "learning analytics",
      "expert pedagogy",
      "education workflow automation",
    ],
    category: "education",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

async function RootI18nProvider({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!isRoutingLocale(locale)) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Convyy",
    "url": BASE_URL,
    "description": "AI tutoring infrastructure for schools: adaptive sessions, expert crystallization, and evidence-backed learning analytics.",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web",
    "audience": {
      "@type": "EducationalAudience",
      "educationalRole": ["teacher", "student", "school-administrator"]
    },
    "publisher": {
      "@type": "Person",
      "name": "Convyy AI",
      "logo": {
        "@type": "ImageObject",
        "url": `${BASE_URL}/logo.png`,
      },
    },
  };

  return (
    <html lang={locale} className="bg-[#FAFAFA]" suppressHydrationWarning translate="no">
      <head>
        <meta name="google" content="notranslate" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${aspekta.variable} ${fasthand.variable} font-sans antialiased bg-[#FAFAFA]`}
      >
        <Providers>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen bg-[#FAFAFA]">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          }>
            <RootI18nProvider>
              {children}
              <CookieConsent />
            </RootI18nProvider>
          </Suspense>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#fff",
                color: "#333",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                boxShadow:
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                padding: "12px 16px",
                fontSize: "14px",
                maxWidth: "356px",
              },
              success: {
                iconTheme: {
                  primary: "#059669",
                  secondary: "white",
                },
              },
              error: {
                iconTheme: {
                  primary: "#DC2626",
                  secondary: "white",
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
