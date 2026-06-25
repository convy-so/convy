import { requireVerifiedSession } from "@/features/auth/public-server";
import { AuthProvider } from "@/features/auth/public-ui";
import { DashboardHeader } from "@/shared/ui/workspace/dashboard-header";
import { DashboardSidebar } from "@/shared/ui/workspace/dashboard-sidebar";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { isInvalidAccountStateError } from "@/features/auth/public-server";
import { getLocalizedAuthIssuePath, getLocalizedSignedInHomePath } from "@/features/auth/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";
import { resolvePreferredUiLocale } from "@/shared/i18n/resolve-locale";
import { resolveViewerAccess, type ViewerAccessContext } from "@/features/auth/public-server";
import { getNotificationsForSession } from "@/shared/http/page-data";

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
  let viewerAccess: ViewerAccessContext;
  try {
    viewerAccess = await resolveViewerAccess(session);
  } catch (error) {
    if (isInvalidAccountStateError(error)) {
      redirect(getLocalizedAuthIssuePath(appLocale));
    }
    throw error;
  }

  if (viewerAccess.authRole !== "teacher") {
    redirect(getLocalizedSignedInHomePath(appLocale, viewerAccess.authRole));
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
