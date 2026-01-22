import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fasthand } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

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
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#fff',
              color: '#333',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              padding: '12px 16px',
              fontSize: '14px',
              maxWidth: '356px',
            },
            success: {
              iconTheme: {
                primary: '#059669',
                secondary: 'white',
              },
            },
            error: {
              iconTheme: {
                primary: '#DC2626',
                secondary: 'white',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
