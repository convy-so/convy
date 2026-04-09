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
        "rounded-[20px] border border-slate-100 bg-white",
        className,
      )}
    >
      {children}
    </div>
  );
}
