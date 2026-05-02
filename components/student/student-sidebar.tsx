"use client";

import { Link, usePathname, useRouter } from "@/i18n/routing";
import {
    LayoutDashboard,
    GraduationCap,
    TrendingUp,
    UserCircle,
    LogOut,
    BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";

export function StudentSidebar() {
    const pathname = usePathname();
    const router = useRouter();

    const navigation = [
        { name: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
        { name: "My Progress", href: "/student/progress", icon: TrendingUp },
        { name: "Learning Sessions", href: "/student/sessions", icon: BookOpen },
        { name: "Learning Profile", href: "/student/profile", icon: UserCircle },
    ];

    const handleSignOut = async () => {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    toast.success("Signed out successfully");
                    router.replace("/sign-in");
                },
            },
        });
    };

    return (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-gray-900 tracking-tight">Convyy Student</span>
            </div>

            <nav className="flex-1 p-4 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-sky-50 text-sky-700"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            <item.icon className={cn("w-4 h-4", isActive ? "text-sky-600" : "text-gray-400")} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-gray-100 space-y-2">
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        </div>
    );
}
