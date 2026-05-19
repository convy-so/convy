import { requireVerifiedSession } from "@/lib/auth/dal";
import { AuthProvider } from "@/components/providers/auth-provider";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { getLocalizedAdminAppPath } from "@/lib/auth/admin-path";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { resolvePreferredUiLocale } from "@/lib/i18n/resolve-locale";
import { resolveViewerAccess } from "@/lib/auth/viewer-access";
import { getNotificationsForSession } from "@/lib/server/app-queries";

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
  const appLocale = normalizeAppLocale(locale);
  const authHeaders = await headers();
  const session = await requireVerifiedSession(authHeaders);
  const viewerAccess = await resolveViewerAccess(session);

  if (viewerAccess.authRole === "student") {
    redirect(`/${locale}/student/dashboard`);
  }

  if (viewerAccess.authRole === "expert") {
    redirect(`/${locale}/expert`);
  }

  if (viewerAccess.authRole === "admin") {
    redirect(getLocalizedAdminAppPath(appLocale));
  }

  const preferredLocale = await resolvePreferredUiLocale(session);

  if (preferredLocale !== locale) {
    redirect(`/api/user/language/sync?locale=${preferredLocale}&redirect=/${preferredLocale}/dashboard`);
  }

  const messages = await getMessages();
  const notifications = await getNotificationsForSession(session);

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <AuthProvider initialSession={session}>
      <div className="min-h-screen bg-[#FAFAFA]">
        <DashboardSidebar
          initialLearningMe={{ role: "non-student", student: null, invitations: [] }}
          viewerAccess={viewerAccess}
        />
        <div className="lg:pl-72 transition-all duration-300 flex flex-col min-h-screen">
          <DashboardHeader initialNotifications={notifications} viewerAccess={viewerAccess} />
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
