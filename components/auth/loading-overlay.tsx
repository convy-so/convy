"use client";

import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  message?: string;
  subtitle?: string;
  className?: string;
}

export function LoadingOverlay({ 
  message = "Loading...", 
  subtitle,
  className
}: LoadingOverlayProps) {
  return (
    <div className={cn(
      "fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-xl animate-in fade-in duration-500",
      className
    )}>
      <div className="flex flex-col items-center gap-6 p-8 rounded-3xl animate-in zoom-in-95 duration-500">
        {/* Modern Premium Spinner */}
        <div className="relative w-16 h-16">
          {/* Subtle Outer Ring */}
          <div className="absolute inset-0 rounded-full border-[3px] border-gray-100/50" />
          
          {/* Main Spinning Element */}
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-gray-900 border-r-gray-900 animate-spin" />
          
          {/* Inner Glow Detail */}
          <div className="absolute inset-[3px] rounded-full border border-gray-50/50" />
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-gray-900 tracking-tight">
            {message}
          </h3>
          {subtitle && (
            <p className="text-sm text-gray-500 font-medium tracking-wide">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
