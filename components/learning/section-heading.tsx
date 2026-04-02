"use client";

import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-[32px]">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-slate-600 md:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
