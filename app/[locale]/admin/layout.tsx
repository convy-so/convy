import { getVerifiedSession } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    // Strict admin check
    const session = await getVerifiedSession().catch(() => null);

    if (!session || !isAdmin(session.user)) {
        // Redirect non-admins to the main dashboard or home
        redirect(`/${locale}`);
    }

    return (
        <div className="flex min-h-screen bg-[#FAFAFA]">
            <AdminSidebar locale={locale} />
            <div className="flex-1 flex flex-col">
                {/* Simple top bar for admin */}
                <header className="h-16 border-b border-gray-200 bg-white flex items-center px-8 sticky top-0 z-10">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                        Admin Console
                    </h2>
                </header>

                <main className="p-8 max-w-7xl mx-auto w-full">
                    {children}
                </main>
            </div>
        </div>
    );
}
