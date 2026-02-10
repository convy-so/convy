import type { Metadata } from "next";

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
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}