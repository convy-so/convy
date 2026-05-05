import { getVerifiedSession } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";

export default function AdminLayout(props: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        }>
            <AdminLayoutContent {...props} />
        </Suspense>
    );
}

async function AdminLayoutContent({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const cookieHeader = (await headers()).get("cookie");

    // Strict admin check
    const session = await getVerifiedSession(cookieHeader).catch(() => null);

    if (!session || !isAdmin(session.user)) {
        // Redirect non-admins to the main dashboard or home
        redirect(`/${locale}`);
    }

    return (
        <div className="flex min-h-screen bg-[#FAFAFA]">
            <AdminSidebar />
            <div className="flex-1 flex flex-col">
                {/* Simple top bar for admin */}
                <header className="h-16 border-b border-gray-200 bg-white flex items-center px-8 sticky top-0 z-10">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                        Admin Console
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
