import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { AuthProvider } from "@/components/providers/auth-provider";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  return (
    <AuthProvider initialSession={session}>
      <div className="min-h-screen bg-[#FAFAFA]">
        <DashboardSidebar user={session?.user ?? null} />
        <div className="lg:pl-72 transition-all duration-300 flex flex-col min-h-screen">
          <DashboardHeader user={session?.user ?? null} />
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
