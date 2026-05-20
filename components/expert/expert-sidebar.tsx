"use client";

import {
  ShieldCheck,
  ChevronLeft,
  LogOut,
  Settings,
  BookOpen,
  Cpu,
  BrainCircuit,
  FlaskConical,
  Sparkles,
  Inbox,
  Boxes,
} from "lucide-react";
import toast from "react-hot-toast";
import { useParams, usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";

export function ExpertSidebar() {
  const pathname = usePathname();
  const params = useParams<{ locale?: string | string[] }>();
  const router = useRouter();
  const locale = Array.isArray(params.locale)
    ? (params.locale[0] ?? "en")
    : (params.locale ?? "en");

  const navigation = [
    { name: "Pedagogical Frameworks", href: "/expert/frameworks", icon: BookOpen },
    { name: "Runtime Models", href: "/expert/runtime-models", icon: Cpu },
    { name: "QA Review", href: "/expert/qa", icon: ShieldCheck },
    { name: "Knowledge Inbox", href: "/expert/knowledge", icon: Inbox },
    { name: "Runtime Preview", href: "/expert/runtime-preview", icon: Sparkles },
    { name: "Eval Baselines", href: "/expert/evals", icon: FlaskConical },
    { name: "AI Ops", href: "/expert/ai-ops", icon: BrainCircuit },
    { name: "Few-Shot Library", href: "/expert/few-shot", icon: Boxes },
    { name: "Settings", href: "/expert/settings", icon: Settings },
  ];

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success("Signed out successfully");
          router.replace(`/${locale}/expert-login`);
        },
      },
    });
  };

  return (
    <div className="w-64 border-r border-slate-200 bg-[#FAFAFA] flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-slate-200 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center shadow-sm">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-slate-950 tracking-tight">Expert Portal</span>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === `/${locale}${item.href}` || pathname.endsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-white text-slate-950 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 border border-transparent",
              )}
            >
              <item.icon className={cn("w-4 h-4", isActive ? "text-slate-950" : "text-slate-400")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
