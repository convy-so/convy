"use client";

import { Users, AlertCircle } from "lucide-react";

interface RespondentLimitTrackerProps {
  currentCount: number;
  maxLimit: number;
}

export function RespondentLimitTracker({ currentCount, maxLimit }: RespondentLimitTrackerProps) {
  const percentage = Math.min(100, (currentCount / maxLimit) * 100);
  const isNearLimit = percentage >= 80;
  const isFull = currentCount >= maxLimit;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isFull ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-black'}`}>
            <Users className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-gray-700">Respondent Capacity</span>
        </div>
        <span className="text-xs font-mono text-gray-400">
          {currentCount} / {maxLimit}
        </span>
      </div>

      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
        <div 
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isFull ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-black'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex justify-between items-center text-[10px]">
        <span className={`${isNearLimit ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
           {isFull ? (
               <span className="flex items-center gap-1 text-red-600 font-bold">
                   <AlertCircle className="w-3 h-3" />
                   Limit Reached
               </span>
           ) : isNearLimit ? (
               "Approaching limit"
           ) : (
               `${Math.round(100 - percentage)}% capacity remaining`
           )}
        </span>
        {isFull && (
            <button className="text-black hover:text-gray-700 font-medium hover:underline">
                Upgrade Plan
            </button>
        )}
      </div>
    </div>
  );
}
