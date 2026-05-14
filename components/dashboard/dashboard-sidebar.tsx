"use client";

import { useMemo, useState } from "react";
import { Link, useRouter } from "@/i18n/routing";
import Image from "next/image";
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Settings,
  FolderOpen,
  GraduationCap,
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Bell,
  Inbox,
  TrendingUp,
  BookOpen,
  Brain,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/auth-provider";
import { usePathname } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";
import type { LearningMeData } from "@/lib/api/learning";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchLearningMe } from "@/lib/api/learning";

export function DashboardSidebar({
  initialLearningMe,
}: {
  initialLearningMe: LearningMeData;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Sidebar");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const learningMeQuery = useQuery({ 
    queryKey: queryKeys.learning.me, 
    queryFn: fetchLearningMe, 
    initialData: initialLearningMe,
    retry: false 
  });

  const isStudent = user?.role === "student" || learningMeQuery.data?.role === "student";
  const isAdminOrExpert = user?.role === "admin" || user?.role === "expert";

  const memberships = learningMeQuery.data?.role === "student" ? learningMeQuery.data.student : [];

  const navigation = useMemo(() => {
    if (isAdminOrExpert) {
      return [
        { name: t("Dashboard"), href: "/dashboard", icon: LayoutDashboard },
        { name: "Learning", href: "/dashboard/learning", icon: GraduationCap },
      ];
    }

    if (isStudent) {
      return [
        { name: t("Dashboard"), href: "/student/dashboard", icon: LayoutDashboard },
        { name: "My Classes", href: "/student/classes", icon: GraduationCap },
        { name: "My Progress", href: "/student/progress", icon: TrendingUp },
        { name: "Learning Sessions", href: "/student/sessions", icon: BookOpen },
      ];
    }

    return [
      { name: t("Dashboard"), href: "/dashboard", icon: LayoutDashboard },
      { name: "Learning Hub", href: "/dashboard/learning", icon: GraduationCap },
      { name: "Assessment Surveys", href: "/dashboard/surveys", icon: MessageSquare },
      { name: "Folders", href: "/dashboard/folders", icon: FolderOpen },
      { name: "Learning Analytics", href: "/dashboard/analytics", icon: BarChart3 },
    ];
  }, [isStudent, isAdminOrExpert, t]);

  const bottomNavigation = useMemo(() => {
    if (isStudent) {
      return [
        { name: "Notifications", href: "/student/notifications", icon: Bell },
        { name: t("Profile"), href: "/student/profile", icon: UserIcon },
        { name: t("Settings"), href: "/student/settings", icon: Settings },
      ];
    }

    return [
      { name: "Notifications", href: "/dashboard/notifications", icon: Bell },
      { name: "Feedback", href: "/dashboard/feedback", icon: Inbox },
      { name: t("Profile"), href: "/dashboard/profile", icon: UserIcon },
      { name: t("Settings"), href: "/dashboard/settings", icon: Settings },
    ];
  }, [isStudent, t]);

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success(t("SignOut") + "...");
          router.replace("/sign-in");
        },
      },
    });
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Mobile backdrop */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-100 transform transition-transform duration-300 ease-out lg:translate-x-0 flex flex-col",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center">
            <Image
              src="/logo.svg"
              alt="Convyy Logo"
              width={20}
              height={20}
              className="w-5 h-5 object-contain invert"
            />
          </div>
          <Link href={isStudent ? "/student/dashboard" : "/dashboard"} className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Convyy</h1>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          <nav className="px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const isCreateSurvey = item.href === "/dashboard/create";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-gray-900 text-white shadow-lg shadow-gray-200"
                      : isCreateSurvey
                        ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <item.icon className={cn(
                    "w-5 h-5",
                    isActive && "scale-110",
                    isCreateSurvey && !isActive && "text-purple-500"
                  )} />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Student Specific Section */}
          {isStudent && memberships.length > 0 && (
            <div className="mt-8 px-3 space-y-1">
              <p className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                My Classrooms
              </p>
              {memberships.map((membership) => (
                <Link
                  key={membership.classroom.id}
                  href={`/student/dashboard?classroomId=${membership.classroom.id}`}
                  className={cn(
                    "flex flex-col gap-0.5 px-3 py-2 rounded-xl text-sm transition-all hover:bg-gray-50 group border border-transparent hover:border-gray-100",
                    pathname.includes(membership.classroom.id) && "bg-gray-50 border-gray-100"
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span className="font-semibold text-gray-700 group-hover:text-gray-900 truncate">
                      {membership.classroom.title}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 pl-3.5 font-medium uppercase tracking-wider">
                    {membership.classroom.gradeLabel}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-100 px-3 py-3">
          {bottomNavigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gray-900 text-white shadow-lg shadow-gray-200"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <item.icon className="w-5 h-5" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* User section */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          {user ? (
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-200 border border-transparent hover:border-red-100 group shadow-sm bg-white"
            >
              <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {t("SignOut")}
            </button>
          ) : (
            <Link
              href="/sign-in"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-all duration-200"
            >
              {t("SignIn")}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
