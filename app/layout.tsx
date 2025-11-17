import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fasthand } from "next/font/google";
import "./globals.css";

const aspekta = localFont({
  src: [
    {
      path: "../public/fonts/Aspekta-400.ttf",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[#FAFAFA]">
      <body
        className={`${aspekta.variable} ${fasthand.variable} font-sans antialiased bg-[#FAFAFA]`}
      >
        {children}
      </body>
    </html>
  );
}
