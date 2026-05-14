import { getVerifiedSession } from "@/lib/auth/dal";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { getLearningMeData, getNotificationsForCurrentUser } from "@/lib/server/app-queries";
import { AuthProvider } from "@/components/providers/auth-provider";
import { getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";

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
    const authHeaders = await headers();
    const session = await getVerifiedSession(authHeaders).catch(() => null);

    if (!session) {
        redirect(`/${locale}/sign-in`);
    }

    const messages = await getMessages();
    const [learningMe, notifications] = await Promise.all([
        getLearningMeData(),
        getNotificationsForCurrentUser(),
    ]);

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <AuthProvider initialSession={session}>
                <div className="flex min-h-screen bg-[#F8F9FB]">
                    <DashboardSidebar initialLearningMe={learningMe} />
                    <div className="flex-1 flex flex-col lg:pl-72 transition-all duration-300">
                        <DashboardHeader initialNotifications={notifications} />
                        
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
