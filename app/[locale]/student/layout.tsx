import { requireVerifiedSession } from "@/features/auth/public-server";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/shared/ui/workspace/dashboard-sidebar";
import { DashboardHeader } from "@/shared/ui/workspace/dashboard-header";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import {
    getLearningMeDataForSession,
    getNotificationsForSession,
} from "@/shared/http/page-data";
import { AuthProvider } from "@/features/auth/public-ui";
import { getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocalizedAuthIssuePath, getLocalizedSignedInHomePath } from "@/features/auth/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";
import { resolveViewerAccess, type ViewerAccessContext } from "@/features/auth/public-server";
import { isInvalidAccountStateError } from "@/features/auth/public-server";

export default function StudentLayout(props: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        }>
            <StudentLayoutContent {...props} />
        </Suspense>
    );
}

async function StudentLayoutContent({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const appLocale = normalizeAppLocale(locale);
    const authHeaders = await headers();
    const session = await requireVerifiedSession(authHeaders).catch(() => null);

    if (!session) redirect(`/${locale}/sign-in`);

    let viewerAccess: ViewerAccessContext;
    try {
      viewerAccess = await resolveViewerAccess(session);
    } catch (error) {
      if (isInvalidAccountStateError(error)) {
        redirect(getLocalizedAuthIssuePath(appLocale));
      }
      throw error;
    }

    if (viewerAccess.authRole !== "student") {
      redirect(getLocalizedSignedInHomePath(appLocale, viewerAccess.authRole));
    }

    const messages = await getMessages();
    const [learningMe, notifications] = await Promise.all([
        getLearningMeDataForSession(session),
        getNotificationsForSession(session),
    ]);

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <AuthProvider initialSession={session}>
                <div className="flex min-h-screen bg-[#f7f7f7]">
                    <DashboardSidebar initialLearningMe={learningMe} viewerAccess={viewerAccess} />
                    <div className="flex-1 flex flex-col lg:pl-72 transition-all duration-300">
                        <DashboardHeader initialNotifications={notifications} viewerAccess={viewerAccess} />

                        <main className="p-4 lg:p-8 max-w-7xl mx-auto w-full flex-1">
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
