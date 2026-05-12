"use client";

import { Link, usePathname, useRouter } from "@/i18n/routing";
import {
    LayoutDashboard,
    GraduationCap,
    TrendingUp,
    UserCircle,
    LogOut,
    BookOpen,
    Brain,
    Sparkles,
    ChevronRight,
    Loader2,
    ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchLearningMe, fetchMyPatterns } from "@/lib/api/learning";

export function StudentSidebar() {
    const pathname = usePathname();
    const router = useRouter();

    const { data: learningMe, isLoading: isMeLoading } = useQuery({
        queryKey: queryKeys.learning.me,
        queryFn: fetchLearningMe,
    });

    const { data: patterns, isLoading: isPatternsLoading } = useQuery({
        queryKey: queryKeys.learning.myPatterns,
        queryFn: fetchMyPatterns,
    });

    const memberships = learningMe?.role === "student" ? learningMe.student : [];
    const invitations = learningMe?.invitations ?? [];
    const recentPatterns = patterns?.success ? patterns.data.slice(0, 2) : [];

    // Collect all pending surveys from all memberships
    const pendingSurveys = memberships.flatMap(m => 
        m.surveys.filter(s => s.responseStatus !== "completed")
    );

    const totalTasks = invitations.length + pendingSurveys.length;

    const navigation = [
        { name: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
        { name: "My Progress", href: "/student/progress", icon: TrendingUp },
        { name: "Learning Sessions", href: "/student/sessions", icon: BookOpen },
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
        <div className="w-72 bg-white border-r border-slate-100 flex flex-col h-screen sticky top-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
            {/* Logo Section */}
            <div className="p-8 pb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-100">
                    <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-slate-900 tracking-tight text-lg leading-none">Convyy</span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Student</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8 custom-scrollbar">
                {/* Main Navigation */}
                <nav className="space-y-1">
                    <p className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Menu</p>
                    {navigation.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                                    isActive
                                        ? "bg-sky-50 text-sky-700 shadow-sm shadow-sky-50"
                                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                <item.icon className={cn("w-4.5 h-4.5 transition-colors", isActive ? "text-sky-600" : "text-slate-400 group-hover:text-slate-600")} />
                                {item.name}
                                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-500" />}
                            </Link>
                        );
                    })}
                </nav>

                {/* Tasks Section */}
                {(invitations.length > 0 || pendingSurveys.length > 0) && (
                    <div className="space-y-3">
                        <div className="px-3 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Pending Tasks</p>
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-600">
                                {totalTasks}
                            </span>
                        </div>
                        <div className="space-y-1">
                            {invitations.map((inv) => (
                                <Link
                                    key={inv.id}
                                    href="/student/dashboard"
                                    className="flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-50/50 border border-amber-100/50 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span className="truncate">Invite: {inv.classroomTitle}</span>
                                </Link>
                            ))}
                            {pendingSurveys.map((survey) => (
                                <Link
                                    key={survey.id}
                                    href={`/s/${survey.shareableLink}/respond`}
                                    className="flex items-center gap-3 px-3 py-2 rounded-xl bg-sky-50/50 border border-sky-100/50 text-xs font-medium text-sky-700 hover:bg-sky-50 transition-colors"
                                >
                                    <ClipboardList className="w-3.5 h-3.5 text-sky-500" />
                                    <span className="truncate">{survey.title}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Classrooms Section */}
                <div className="space-y-3">
                    <div className="px-3 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">My Classes</p>
                        {isMeLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-300" />}
                    </div>
                    <div className="space-y-1">
                        {memberships.length > 0 ? (
                            memberships.map((membership) => (
                                <Link
                                    key={membership.classroom.id}
                                    href={`/student/dashboard?classroomId=${membership.classroom.id}`}
                                    className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-slate-50 group border border-transparent hover:border-slate-100"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                        <span className="font-semibold text-slate-700 group-hover:text-slate-900 truncate">
                                            {membership.classroom.title}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 pl-3.5 font-medium uppercase tracking-wider">
                                        {membership.classroom.gradeLabel}
                                    </span>
                                </Link>
                            ))
                        ) : !isMeLoading && (
                            <div className="px-3 py-4 text-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200">
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider leading-relaxed">
                                    No classes yet
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Insights Section */}
                <div className="space-y-3">
                    <div className="px-3 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Learning Insights</p>
                        <Brain className="w-3 h-3 text-slate-300" />
                    </div>
                    <div className="space-y-2">
                        {recentPatterns.length > 0 ? (
                            recentPatterns.map((pattern, idx) => (
                                <div
                                    key={idx}
                                    className="px-3 py-3 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 flex flex-col gap-2 group cursor-default"
                                >
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            {pattern.confidenceLabel} Match
                                        </span>
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-slate-600 font-medium italic line-clamp-2 group-hover:line-clamp-none transition-all">
                                        &ldquo;{pattern.studentSummary}&rdquo;
                                    </p>
                                </div>
                            ))
                        ) : !isPatternsLoading && (
                            <div className="px-3 py-4 text-center">
                                <p className="text-[10px] text-slate-300 font-medium uppercase tracking-widest leading-relaxed italic">
                                    Generating insights...
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-slate-50 space-y-2">
                <Link
                    href="/student/profile"
                    className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                        pathname === "/student/profile"
                            ? "bg-slate-900 text-white shadow-lg shadow-slate-100"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    )}
                >
                    <UserCircle className={cn("w-4.5 h-4.5", pathname === "/student/profile" ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
                    My Account
                    <ChevronRight className="ml-auto w-3.5 h-3.5 opacity-40" />
                </Link>
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-all group"
                >
                    <LogOut className="w-4.5 h-4.5 text-red-400 group-hover:text-red-500" />
                    Sign Out
                </button>
            </div>
        </div>
    );
}
