import { getVerifiedSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student/student-sidebar";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";

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
    const cookieHeader = (await headers()).get("cookie");

    // Student/User check
    const session = await getVerifiedSession(cookieHeader).catch(() => null);

    if (!session) {
        redirect(`/${locale}/sign-in`);
    }

    return (
        <div className="flex min-h-screen bg-[#F8F9FB]">
            <StudentSidebar />
            <div className="flex-1 flex flex-col">
                <header className="h-16 border-b border-gray-200 bg-white flex items-center px-8 sticky top-0 z-10 shadow-sm">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                        Student Portal
                    </h2>
                </header>

                <main className="p-8 max-w-7xl mx-auto w-full">
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
    );
}
