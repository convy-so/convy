import { getVerifiedSession } from "@/lib/auth/dal";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { AuthProvider } from "@/components/providers/auth-provider";

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

    return (
        <AuthProvider initialSession={session}>
            <div className="min-h-screen bg-[#FAFAFA]">
                <DashboardSidebar />
                <div className="lg:pl-72 transition-all duration-300 flex flex-col min-h-screen">
                    <DashboardHeader />
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
