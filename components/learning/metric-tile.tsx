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
        "bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all duration-300 group",
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2 group-hover:text-slate-500 transition-colors">
        {label}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:scale-[1.02] transition-transform origin-left">
          {value}
        </div>
        {accent ? (
          <div className="rounded-lg border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-600">
            {accent}
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-[13px] text-slate-500 leading-relaxed font-medium">
        {helper}
      </p>
    </div>
  );
}
