"use client";

import Image from "next/image";
import { usePresence } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";

interface ActiveUsersProps {
  workspaceId: string;
  surveyId?: string;
  className?: string;
}

export function ActiveUsers({ workspaceId, surveyId, className }: ActiveUsersProps) {
  const { users } = usePresence({ workspaceId, surveyId });

  if (users.length === 0) return null;

  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      {users.slice(0, 5).map((user) => (
        <div key={user.userId} className="relative group">
          <div 
            className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-gray-100 shadow-sm ring-1 ring-black/5"
          >
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name}
                width={32}
                height={32}
                unoptimized
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                {user.name && user.name !== "User" ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
            )}
          </div>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
          
          {/* Premium Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900/90 text-white text-[10px] rounded-md backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-50 shadow-xl border border-white/10 translate-y-1 group-hover:translate-y-0">
            {user.name}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-gray-900/90" />
          </div>
        </div>
      ))}
      {users.length > 5 && (
        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-50 flex items-center justify-center text-[10px] font-medium text-gray-600 shadow-sm ring-1 ring-black/5">
          +{users.length - 5}
        </div>
      )}
    </div>
  );
}
