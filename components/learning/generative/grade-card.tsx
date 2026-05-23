"use client";

import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function GradeCard({
  score,
  feedback,
  masteryLevel,
}: {
  score: number;
  feedback: string;
  masteryLevel: "surface" | "applied" | "generative";
}) {
  const isPerfect = score >= 95;
  const isGood = score >= 70 && score < 95;
  const isNeedsWork = score < 70;

  return (
    <div className="w-full max-w-md mx-auto my-4 bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40">
      <div
        className={cn(
          "p-6 flex items-start gap-4",
          isPerfect && "bg-emerald-50",
          isGood && "bg-sky-50",
          isNeedsWork && "bg-amber-50"
        )}
      >
        <div
          className={cn(
            "w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center shadow-inner",
            isPerfect && "bg-emerald-100 text-emerald-600",
            isGood && "bg-sky-100 text-sky-600",
            isNeedsWork && "bg-amber-100 text-amber-600"
          )}
        >
          {isPerfect && <Sparkles className="w-7 h-7" />}
          {isGood && <CheckCircle2 className="w-7 h-7" />}
          {isNeedsWork && <AlertCircle className="w-7 h-7" />}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className={cn(
              "text-sm font-extrabold uppercase tracking-widest",
              isPerfect && "text-emerald-700",
              isGood && "text-sky-700",
              isNeedsWork && "text-amber-700"
            )}>
              Quiz Result
            </h3>
            <div className={cn(
              "text-2xl font-black",
              isPerfect && "text-emerald-600",
              isGood && "text-sky-600",
              isNeedsWork && "text-amber-600"
            )}>
              {score}<span className="text-sm opacity-50">%</span>
            </div>
          </div>
          
          <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/60 text-slate-600 mb-3">
            Mastery: {masteryLevel}
          </div>
          
          <p className="text-sm font-medium text-slate-700 leading-relaxed">
            {feedback}
          </p>
        </div>
      </div>
    </div>
  );
}
