"use client";

import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  message?: string;
  subtitle?: string;
}

export function LoadingOverlay({ 
  message = "Loading...", 
  subtitle 
}: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-200 rounded-full" />
          <Loader2 className="absolute inset-0 w-12 h-12 text-[#292929] animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-[#292929]">{message}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-[#696969]">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
