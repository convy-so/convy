"use client";

import { cn } from "@/lib/utils";

export function GlassPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-100 bg-white",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
