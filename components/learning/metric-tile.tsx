"use client";

import { cn } from "@/lib/utils";

export function MetricTile({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-white/70 bg-white/80 px-5 py-5 backdrop-blur-lg",
        "transition-transform duration-300 hover:-translate-y-0.5",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="text-3xl font-semibold tracking-tight text-slate-950">
          {value}
        </div>
        {accent ? (
          <div className="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-xs font-medium text-sky-700">
            {accent}
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}
