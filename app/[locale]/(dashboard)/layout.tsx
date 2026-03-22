import { getCurrentSession } from "@/lib/auth/session";
import { AuthProvider } from "@/components/providers/auth-provider";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type SupportedLanguage } from "@/lib/i18n/ai-translator";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

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

  // Deep Sync: Verify database preference matches URL locale
  if (session?.user) {
    const preferredLanguage = (session.user as any)
      .preferredLanguage as SupportedLanguage;

    if (preferredLanguage && preferredLanguage !== locale) {
      // 1. Redirect to the sync API to safely update cookies and then land on the correct locale
      // This is the production-ready way to handle "Deep Sync" in Next.js 16
      redirect(`/api/user/language/sync?locale=${preferredLanguage}&redirect=/${preferredLanguage}/dashboard`);
    }
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
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
    </NextIntlClientProvider>
  );
}
