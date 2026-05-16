"use client";

import { useMemo, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/routing";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/auth-provider";
import { useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";
import type { LearningMeData } from "@/lib/api/learning";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchLearningMe } from "@/lib/api/learning";
import { classroomInitials } from "@/lib/student-course-accents";

type ViewerAccessNav = {
  authRole: "student" | "teacher" | "expert" | "admin";
};

function isNavHrefActive(
  pathname: string,
  href: string,
  options?: { exact?: boolean },
) {
  if (pathname === href) return true;
  if (options?.exact) return false;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export function DashboardSidebar({
  initialLearningMe,
  viewerAccess,
}: {
  initialLearningMe: LearningMeData;
  viewerAccess: ViewerAccessNav;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("Sidebar");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const selectedClassroomId = searchParams.get("classroomId");

  const learningMeQuery = useQuery({
    queryKey: queryKeys.learning.me,
    queryFn: fetchLearningMe,
    initialData: initialLearningMe,
    retry: false
  });

  const isStudent = viewerAccess.authRole === "student" || learningMeQuery.data?.role === "student";
  const isAdminOrExpert = viewerAccess.authRole === "admin" || viewerAccess.authRole === "expert";

  const memberships = learningMeQuery.data?.role === "student" ? learningMeQuery.data.student : [];
  const studentProgressHref = selectedClassroomId
    ? `/student/progress?classroomId=${selectedClassroomId}`
    : "/student/progress";
  const studentSessionsHref = selectedClassroomId
    ? `/student/sessions?classroomId=${selectedClassroomId}`
    : "/student/sessions";
  const studentProfileHref = selectedClassroomId
    ? `/student/profile?classroomId=${selectedClassroomId}`
    : "/student/profile";

  const navigation = useMemo(() => {
    if (isAdminOrExpert) {
      return [
        { name: t("Dashboard"), href: "/dashboard", icon: LayoutDashboard, exact: true },
        { name: "Learning", href: "/dashboard/learning", icon: GraduationCap },
      ];
    }

    if (isStudent) {
      return [
        { name: t("Dashboard"), href: "/student/dashboard", icon: LayoutDashboard, exact: true },
        { name: "My Classes", href: "/student/classes", icon: GraduationCap },
        { name: "My Progress", href: studentProgressHref, icon: TrendingUp },
        { name: "Learning Sessions", href: studentSessionsHref, icon: BookOpen },
      ];
    }

    return [
      { name: t("Dashboard"), href: "/dashboard", icon: LayoutDashboard, exact: true },
      { name: "Classrooms", href: "/dashboard/learning", icon: GraduationCap },
      { name: "Surveys", href: "/dashboard/surveys", icon: MessageSquare },
      { name: "Folders", href: "/dashboard/folders", icon: FolderOpen },
    ];
  }, [isStudent, isAdminOrExpert, studentProgressHref, studentSessionsHref, t]);

  const bottomNavigation = useMemo(() => {
    if (isStudent) {
      return [
        { name: "Notifications", href: "/student/notifications", icon: Bell },
        { name: t("Profile"), href: studentProfileHref, icon: UserIcon },
        { name: t("Settings"), href: "/student/settings", icon: Settings },
      ];
    }

    return [
      { name: "Notifications", href: "/dashboard/notifications", icon: Bell },
      { name: "Feedback", href: "/dashboard/feedback", icon: Inbox },
      { name: t("Profile"), href: "/dashboard/profile", icon: UserIcon },
      { name: t("Settings"), href: "/dashboard/settings", icon: Settings },
    ];
  }, [isStudent, studentProfileHref, t]);

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
          className={cn(
            "p-2.5 rounded-2xl border transition-colors shadow-[0_2px_0_0_#e5e5e5]",
            isStudent
              ? "bg-white border-[#e5e5e5] text-[#3c3c3c] hover:bg-[#f7f7f7]"
              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50",
          )}
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
          "fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-out lg:translate-x-0 flex flex-col border-r",
          isStudent
            ? "bg-[#fafafa] border-[#e5e5e5]"
            : "bg-white border-gray-100",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center gap-3 px-6 py-5 border-b",
            isStudent ? "border-[#e5e5e5] bg-white/60" : "border-gray-100"
          )}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 shadow-sm">
            <Image
              src="/logo.svg"
              alt="Convyy Logo"
              width={20}
              height={20}
              className="h-5 w-5 object-contain invert"
            />
          </div>
          <Link href={isStudent ? "/student/dashboard" : "/dashboard"} className="flex items-center">
            <h1
              className={cn(
                "text-xl font-bold tracking-tight",
                isStudent ? "text-[#3c3c3c]" : "text-gray-900"
              )}
            >
              Convyy
            </h1>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          <nav className="px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = isNavHrefActive(pathname, item.href, {
                exact: item.exact,
              });
              const isCreateSurvey = item.href === "/dashboard/create";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-bold transition-all duration-200",
                    isActive
                        ? "bg-gray-900 text-white shadow-lg shadow-gray-200"
                        : isCreateSurvey
                          ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <item.icon className={cn(
                    "w-5 h-5 shrink-0",
                    isActive && "scale-110",
                    isCreateSurvey && !isActive && "text-purple-500"
                  )} />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Student: course-style class picker (horizontal path, Duolingo-like) */}
          {isStudent && memberships.length > 0 && (
            <div className="mt-6 px-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[13px] font-extrabold text-[#3c3c3c]">My courses</p>
                <span className="rounded-lg bg-[#e5e5e5] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#52656d]">
                  {memberships.length}
                </span>
              </div>
              <p className="mb-3 px-1 text-[11px] font-medium leading-snug text-[#777777]">
                Tap a course to jump into that classroom.
              </p>
              <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 pl-1 pr-1 pt-0.5 [scrollbar-width:thin]">
                {memberships.map((membership) => {
                  const classroomNavActive =
                    isNavHrefActive(pathname, "/student/dashboard", { exact: true }) &&
                    searchParams.get("classroomId") === membership.classroom.id;
                  return (
                    <Link
                      key={membership.classroom.id}
                      href={`/student/dashboard?classroomId=${membership.classroom.id}`}
                      className={cn(
                        "w-[152px] shrink-0 snap-start rounded-xl border bg-white p-3 transition-colors",
                        classroomNavActive
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60",
                      )}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <div
                        className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-[11px] font-bold uppercase tracking-tight text-gray-700"
                        aria-hidden
                      >
                        {classroomInitials(membership.classroom.title)}
                      </div>
                      <p
                        className={cn(
                          "line-clamp-2 min-h-[2.25rem] text-center text-[12px] font-bold leading-tight",
                          classroomNavActive ? "text-[#3c3c3c]" : "text-[#3c3c3c]",
                        )}
                      >
                        {membership.classroom.title}
                      </p>
                      <p className="mt-1 truncate text-center text-[10px] font-semibold text-[#afafaf]">
                        {membership.classroom.gradeLabel}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div
          className={cn(
            "border-t px-3 py-3",
            isStudent ? "border-[#e5e5e5] bg-white/40" : "border-gray-100"
          )}
        >
          {bottomNavigation.map((item) => {
            const isActive = isNavHrefActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-bold transition-all duration-200",
                  isActive
                    ? "bg-gray-900 text-white shadow-lg shadow-gray-200"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* User section */}
        <div
          className={cn(
            "p-4 border-t",
            isStudent ? "border-[#e5e5e5] bg-white/80" : "border-gray-100 bg-gray-50/50"
          )}
        >
          {user ? (
            <button
              onClick={handleSignOut}
              className={cn(
                "w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 border group",
                isStudent
                  ? "border-[#ffc1c1] bg-[#fff4f4] text-[#ff4b4b] hover:bg-[#ffe8e8]"
                  : "text-red-600 hover:bg-red-50 hover:text-red-700 border-transparent hover:border-red-100 shadow-sm bg-white"
              )}
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
