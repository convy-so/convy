import { cn } from "@/lib/utils";

interface SentimentGaugeProps {
  score: number; // -1 to 1
  confidence: number;
  overall: "positive" | "negative" | "neutral" | "mixed";
}

export function SentimentGauge({ score, confidence, overall }: SentimentGaugeProps) {
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
    colorClass = "text-blue-600";
    bgClass = "bg-blue-50";
    barColor = "#3B82F6"; // blue-500
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-gray-300 to-emerald-500 opacity-20" />
        
        <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider">Overall Sentiment</h3>
        
        <div className="relative w-48 h-24 overflow-hidden mb-2">
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
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[1px] w-32 h-16 bg-white rounded-t-full z-10 flex items-end justify-center pb-2">
                 <span className={cn("text-3xl font-bold", colorClass)}>
                    {Math.round(score * 100)}
                 </span>
            </div>
        </div>
        
        <div className="text-center z-10 mt-2">
            <p className={cn("text-lg font-bold capitalize", colorClass)}>{overall}</p>
            <p className="text-xs text-gray-400 mt-1">{(confidence * 100).toFixed(0)}% Confidence</p>
        </div>
    </div>
  );
}
