import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { Metadata } from "next";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/lib/env";

export const metadata: Metadata = {
    title: "Admin Console",
    robots: {
        index: false,
        follow: false,
    },
};

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
    const cookieHeader = (await headers()).get("cookie") || "";

    const match = cookieHeader.match(/admin_session=([^;]+)/);
    let isAdmin = false;

    if (match) {
        const token = match[1];
        const redis = getRedisClient();
        const email = await redis.get(`admin_session:${token}`);
        if (email && env.ADMIN_EMAILS.includes(email.toLowerCase())) {
            isAdmin = true;
        }
    }

    if (!isAdmin) {
        // Redirect non-admins to the login page of the admin portal
        redirect(`/${locale}/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI/login`);
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
