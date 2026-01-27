import { cn } from "@/lib/utils";
import { Target, CheckCircle2, Circle, XCircle } from "lucide-react";

interface GoalAssessmentProps {
  score: number; // 1-10
  level: "exceeded" | "met" | "partially_met" | "not_met";
  objective: string;
}

export function GoalAssessmentCard({ score, level, objective }: GoalAssessmentProps) {
  let colorClass = "bg-gray-100 text-gray-600";
  let icon = <Circle className="w-5 h-5" />;
  
  if (level === "exceeded") {
    colorClass = "bg-emerald-100 text-emerald-700";
    icon = <CheckCircle2 className="w-5 h-5" />;
  } else if (level === "met") {
    colorClass = "bg-blue-100 text-blue-700";
    icon = <CheckCircle2 className="w-5 h-5" />;
  } else if (level === "partially_met") {
    colorClass = "bg-amber-100 text-amber-700";
    icon = <Target className="w-5 h-5" />;
  } else {
    colorClass = "bg-red-100 text-red-700";
    icon = <XCircle className="w-5 h-5" />;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-2">
             <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Goal Achievement</h3>
             <div className={cn("px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 capitalize", colorClass)}>
                {icon}
                {level.replace('_', ' ')}
             </div>
        </div>
        <div className="flex items-end gap-2 mb-4">
             <span className="text-4xl font-bold text-gray-900">{score}</span>
             <span className="text-sm text-gray-400 mb-1.5">/ 10</span>
        </div>
      </div>
      
      {objective && (
          <div className="mt-auto pt-4 border-t border-gray-50">
            <p className="text-xs text-gray-400 mb-1">Objective</p>
            <p className="text-sm text-gray-600 italic line-clamp-2">"{objective}"</p>
          </div>
      )}
    </div>
  );
}
