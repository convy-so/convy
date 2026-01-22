"use client"
import { User } from "better-auth/types";
import { Search, LogOut, Settings, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";

interface DashboardHeaderProps {
  user: User | null;
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success("Signed out successfully");
          router.push("/sign-in");
        },
      },
    });
  };

  return (
    <header className="h-16 border-b border-[#EAEAEA] bg-white px-6 flex items-center justify-between sticky top-0 z-10 transition-all duration-300">
      <div className="flex items-center gap-4 lg:hidden">
        <span className="font-semibold text-[#292929]">Convy</span>
      </div>

      <div className="flex-1 max-w-md hidden lg:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border-none text-sm focus:ring-2 focus:ring-gray-200 transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="relative">
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-3 pl-4 border-l border-gray-100 hover:opacity-80 transition-opacity"
            >
             <div className="text-right hidden sm:block">
               <p className="text-sm font-medium text-gray-900 leading-none">{user.name}</p>
               <p className="text-xs text-gray-500 mt-1 leading-none">{user.email}</p>
             </div>
             <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm ring-2 ring-white">
                {user.name?.charAt(0).toUpperCase()}
             </div>
           </button>

           {isDropdownOpen && (
             <>
               <div 
                 className="fixed inset-0 z-10" 
                 onClick={() => setIsDropdownOpen(false)} 
               />
               <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 p-2 z-20 animate-in fade-in zoom-in-95 duration-100">
                 <div className="px-2 py-1.5 border-b border-gray-50 mb-1 lg:hidden">
                   <p className="text-sm font-medium text-gray-900">{user.name}</p>
                   <p className="text-xs text-gray-500">{user.email}</p>
                 </div>
                 
                 <Link 
                   href="/dashboard/profile"
                   onClick={() => setIsDropdownOpen(false)}
                   className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                 >
                   <UserIcon className="w-4 h-4 text-gray-400" />
                   Profile
                 </Link>
                 <Link 
                   href="/dashboard/settings"
                   onClick={() => setIsDropdownOpen(false)}
                   className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                 >
                   <Settings className="w-4 h-4 text-gray-400" />
                   Settings
                 </Link>
                 
                 <div className="h-px bg-gray-100 my-1" />
                 
                 <button
                   onClick={handleSignOut}
                   className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                 >
                   <LogOut className="w-4 h-4" />
                   Log out
                 </button>
               </div>
             </>
           )}
          </div>
        )}
      </div>
    </header>
  );
}
