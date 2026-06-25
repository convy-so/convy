"use client";

import { cn } from "@/shared/ui/tailwind-class-utils";

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
        "flex flex-col gap-8 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="space-y-4">
        {eyebrow ? (
          <div className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-[10px] font-medium uppercase text-slate-400 border border-slate-100">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-3xl font-medium text-slate-900 md:text-4xl leading-tight">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-base font-medium leading-relaxed text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
