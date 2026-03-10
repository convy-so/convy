import type { Metadata } from "next";
import { Suspense } from "react";

import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/components/providers/auth-provider";

export const metadata: Metadata = {
  title: "Authentication — Convy",
  description: "Sign in to your Convy account",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </div>
    </AuthProvider>
  );
}
