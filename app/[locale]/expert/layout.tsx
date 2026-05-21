import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ExpertSidebar } from "@/components/expert/expert-sidebar";
import { requireExpertUser } from "@/lib/auth/dal";

export default function ExpertLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <ExpertLayoutContent {...props} />
    </Suspense>
  );
}

async function ExpertLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieHeader = (await headers()).get("cookie");
  const session = await requireExpertUser(cookieHeader).catch(() => null);

  if (!session) {
    redirect(`/${locale}/expert-login`);
  }

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]">
      <ExpertSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center px-8 sticky top-0 z-10">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Expert Workspace
          </h2>
        </header>
        <main className="p-8 max-w-7xl mx-auto w-full">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
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
