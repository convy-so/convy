import { cn } from "@/lib/utils";

interface SentimentGaugeProps {
  score: number; // -1 to 1
  confidence: number;
  overall: "positive" | "negative" | "neutral" | "mixed";
  compact?: boolean;
}

export function SentimentGauge({ score, confidence, overall, compact = false }: SentimentGaugeProps) {
  // Normalize score from -1..1 to 0..100 for the gauge
  const percentage = ((score + 1) / 2) * 100;
  
  // Color based on overall sentiment
  let colorClass = "text-gray-500";
  let bgClass = "bg-gray-100";
  let barColor = "#9CA3AF"; // gray-400
  
  if (overall === 'positive') {
    colorClass = "text-emerald-600";
    bgClass = "bg-emerald-50";
    barColor = "#10B981"; // emerald-500
  } else if (overall === 'negative') {
    colorClass = "text-red-600";
    bgClass = "bg-red-50";
    barColor = "#EF4444"; // red-500
  } else if (overall === 'mixed') {
    colorClass = "text-amber-600";
    bgClass = "bg-amber-50";
    barColor = "#F59E0B"; // amber-500
  } else {
    // neutral
    colorClass = "text-gray-900";
    bgClass = "bg-gray-50";
    barColor = "#6b7280"; // gray-500
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center relative overflow-hidden h-full",
      !compact && "bg-white rounded-[2rem] border border-gray-50 p-8"
    )}>
        {!compact && (
          <h3 className="text-xs font-bold text-gray-400 mb-6 uppercase tracking-widest text-center">Overall Sentiment</h3>
        )}
        
        <div className={cn(
          "relative overflow-hidden mb-4",
          compact ? "w-32 h-16" : "w-40 h-20"
        )}>
            {/* Semicircle Background */}
            <div className="absolute bottom-0 w-full h-full bg-gray-100 rounded-t-full" />
            
            {/* Semicircle Fill */}
            <div 
                className="absolute bottom-0 w-full h-full origin-bottom rounded-t-full transition-transform duration-1000 ease-out"
                style={{ 
                    transform: `rotate(${percentage * 1.8 - 180}deg)`,
                    backgroundColor: barColor 
                }}
            />
             {/* Mask to make it an arc */}
            <div className={cn(
              "absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[1px] bg-white rounded-t-full z-10 flex items-end justify-center pb-1",
              compact ? "w-24 h-12" : "w-28 h-14"
            )}>
                 <span className={cn(
                   "font-extrabold tracking-tighter",
                   compact ? "text-2xl" : "text-4xl"
                  )}>
                    {Math.round(score * 100)}
                 </span>
            </div>
        </div>
        
        <div className="text-center z-10">
            <p className={cn(
              "font-extrabold uppercase tracking-wide",
              compact ? "text-sm" : "text-base",
              colorClass
            )}>{overall}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">{(confidence * 100).toFixed(0)}% Confidence</p>
        </div>
    </div>
  );
}
