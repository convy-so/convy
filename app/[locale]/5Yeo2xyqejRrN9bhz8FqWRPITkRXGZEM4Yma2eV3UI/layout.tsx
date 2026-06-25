import { Suspense } from "react";
import { headers } from "next/headers";
import { Loader2 } from "lucide-react";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/features/admin/ui/admin-sidebar";
import { requireRole } from "@/features/auth/public-server";

export default function AdminLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
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
  const session = await requireRole("admin", cookieHeader).catch(() => null);

  if (!session) {
    redirect(`/${locale}`);
  }

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center border-b border-gray-200 bg-white px-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Admin Console
          </h2>
        </header>

        <main className="mx-auto w-full max-w-7xl p-8">
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
