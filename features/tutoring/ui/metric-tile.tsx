"use client";

import { cn } from "@/shared/ui/tailwind-class-utils";

export function MetricTile({
  label,
  value,
  helper,
  accent,
  color = "blue",
}: {
  label: string;
  value: string;
  helper: string;
  accent?: string;
  color?: "blue" | "violet" | "emerald" | "amber";
}) {
  const colorStyles = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    violet: "text-violet-600 bg-violet-50 border-violet-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
  };

  return (
    <div
      className={cn(
        "bg-white rounded-3xl border border-slate-100 p-6 transition-all hover:shadow-xl hover:shadow-slate-200/40 group cursor-default relative overflow-hidden",
      )}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-slate-50 to-transparent opacity-50 -mr-8 -mt-8 rounded-full" />
      
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 relative z-10">
        {label}
      </div>
      
      <div className="flex items-end justify-between gap-3 relative z-10">
        <div className="text-3xl font-semibold text-slate-900 tracking-tight">
          {value}
        </div>
        {accent ? (
          <div className={cn("rounded-xl px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border", colorStyles[color])}>
            {accent}
          </div>
        ) : null}
      </div>
      
      <p className="mt-4 text-sm text-slate-500 font-medium relative z-10 flex items-center gap-2">
        <span className={cn("w-1.5 h-1.5 rounded-full", 
          color === 'blue' ? 'bg-blue-400' : 
          color === 'violet' ? 'bg-violet-400' : 
          color === 'emerald' ? 'bg-emerald-400' : 'bg-amber-400'
        )} />
        {helper}
      </p>
    </div>
  );
}
