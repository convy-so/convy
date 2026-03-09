import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fasthand } from "next/font/google";
import "../globals.css";
import { Toaster } from "react-hot-toast";
import Providers from "../providers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Suspense } from "react";


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

const fasthand = Fasthand({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-fasthand",
});

import { translateUIString, SupportedLanguage } from "@/lib/i18n/ai-translator";

const METADATA_CONFIG: Record<SupportedLanguage, { title: string; description: string }> = {
  en: {
    title: "Convy — Turn Forms into AI Conversations",
    description: "Boring forms are dead. Meet modern, AI-native conversations.",
  },
  fr: {
    title: "Convy — Transformez vos formulaires en conversations IA",
    description: "Les formulaires ennuyeux, c'est fini. Découvrez les conversations natives IA.",
  },
  de: {
    title: "Convy — Verwandeln Sie Formulare in KI-Gespräche",
    description: "Langweilige Formulare sind passée. Erleben Sie moderne KI-Gespräche.",
  },
  es: {
    title: "Convy — Convierta formularios en conversaciones de IA",
    description: "Los formularios aburridos han muerto. Conozca las conversaciones nativas de IA.",
  },
  it: {
    title: "Convy — Trasforma i moduli in conversazioni AI",
    description: "I moduli noiosi sono finiti. Scopri le conversazioni native AI.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = (locale as SupportedLanguage) || "en";
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
        es: "/es",
        it: "/it",
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/${locale}`,
      siteName: "Convy",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
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
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Convy",
    "url": BASE_URL,
    "description": "AI-native survey platform",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "publisher": {
      "@type": "Organization",
      "name": "Convy AI",
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

