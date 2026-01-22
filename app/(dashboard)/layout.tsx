import type { Metadata } from "next";
import { auth } from "@/lib/auth"; // Import backend auth
import { headers } from "next/headers";


export async function DashboardHeader() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  return (
    <header className="h-16 border-b border-[#EAEAEA] bg-white px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4 lg:hidden">
        <span className="font-semibold text-[#292929]">Convy</span>
      
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        {session?.user && (
             <div className="flex items-center gap-2">
                 <span className="text-sm font-medium">{session.user.name}</span>
             </div>
        )}
      </div>
    </header>
  );
}