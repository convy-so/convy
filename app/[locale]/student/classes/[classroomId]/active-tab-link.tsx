"use client";

import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/shared/ui/tailwind-class-utils";

export function ActiveTabLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    const pathname = usePathname();
    const isActive = pathname === href || pathname.startsWith(`${href}/`);

    return (
        <Link
            href={href}
            className={cn(
                "pb-4 flex items-center gap-2 border-b-2 font-bold text-sm transition-all duration-200",
                isActive
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            )}
        >
            {icon}
            {label}
        </Link>
    );
}
