import { getCurrentSession } from "@/lib/auth/session";
import { AuthProvider } from "@/components/providers/auth-provider";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <DashboardLayoutContent params={params}>{children}</DashboardLayoutContent>
    </Suspense>
  );
}

async function DashboardLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authHeaders = await headers();
  const session = await getCurrentSession(authHeaders);

  return (
    <AuthProvider initialSession={session}>
      <div className="min-h-screen bg-[#FAFAFA]">
        <DashboardSidebar user={session?.user ?? null} />
        <div className="lg:pl-72 transition-all duration-300 flex flex-col min-h-screen">
          <DashboardHeader user={session?.user ?? null} />
          <main className="flex-1 p-4 lg:p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            }>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
