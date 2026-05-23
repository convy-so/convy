"use client";

import { ChevronLeft } from "lucide-react";

import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const SUBPAGES = [
  { href: "/expert/frameworks/studio", label: "Framework studio" },
  { href: "/expert/frameworks/courses", label: "Courses" },
] as const;

export function ExpertFrameworkSubnav({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="mb-8 space-y-5">
      <Link
        href="/expert/frameworks"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Frameworks
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>

      <nav className="-mb-px flex gap-6 border-b border-slate-200" aria-label="Framework sections">
        {SUBPAGES.map((item) => {
          const isActive = pathname === item.href || pathname.endsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "border-b-2 pb-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
