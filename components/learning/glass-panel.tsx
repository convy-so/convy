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
        "rounded-[20px] border border-white/60 bg-white/72 backdrop-blur-xl",
        "shadow-[0_24px_80px_-48px_rgba(15,23,42,0.28)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
