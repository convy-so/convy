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
        "bg-white rounded-2xl border border-slate-100 p-5 transition-all hover:bg-slate-50 group cursor-default",
      )}
    >
      <div className="text-[10px] font-medium uppercase text-slate-400 mb-2">
        {label}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xl font-medium text-slate-900">
          {value}
        </div>
        {accent ? (
          <div className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 uppercase">
            {accent}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-slate-500 font-medium">
        {helper}
      </p>
    </div>
  );
}
