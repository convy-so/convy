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

export const metadata: Metadata = {
  title: "Convy — Turn Forms into AI Conversations",
  description: "Boring forms are dead. Meet modern, AI-native conversations.",
};

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

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale} className="bg-[#FAFAFA]" suppressHydrationWarning translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body
        className={`${aspekta.variable} ${fasthand.variable} font-sans antialiased bg-[#FAFAFA]`}
      >
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {children}
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
