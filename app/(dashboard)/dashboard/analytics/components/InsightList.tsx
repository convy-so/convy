import { cn } from "@/lib/utils";
import { Lightbulb, TrendingUp, AlertTriangle } from "lucide-react";

interface Insight {
  text: string;
  significance: "high" | "medium" | "low";
  sentiment?: "positive" | "negative" | "neutral";
}

interface InsightListProps {
  title: string;
  insights: Insight[];
  type?: "key_insights" | "trends";
}

export function InsightList({ title, insights, type = "key_insights" }: InsightListProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        {type === "key_insights" ? (
             <Lightbulb className="w-5 h-5 text-amber-500" />
        ) : (
            <TrendingUp className="w-5 h-5 text-blue-500" />
        )}
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      
      <div className="space-y-3">
        {insights.map((insight, idx) => (
          <div 
            key={idx} 
            className={cn(
                "p-3 rounded-xl border text-sm leading-relaxed",
                insight.significance === "high" ? "bg-amber-50/50 border-amber-100" : "bg-gray-50 border-gray-100",
                insight.sentiment === "positive" && "border-l-4 border-l-emerald-400",
                insight.sentiment === "negative" && "border-l-4 border-l-red-400",
            )}
          >
             <div className="flex gap-2">
                {insight.significance === "high" && (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                )}
                <span className="text-gray-700">{insight.text}</span>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
