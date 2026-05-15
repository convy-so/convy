
"use client"
import Image from "next/image";
import { Search, LogOut, Settings, User as UserIcon, Bell } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useRouter, Link } from "@/i18n/routing";
import { markNotificationAsRead } from "@/app/actions/notifications";
import toast from "react-hot-toast";

import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/auth-provider";
import { getFriendlyActionError } from "@/lib/action-ux";
import { cn } from "@/lib/utils";

type ViewerAccessHeader = {
  authRole: "student" | "teacher" | "expert" | "admin";
};

type NotificationListItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string | Date;
  read: boolean;
  link?: string | null;
};

export function DashboardHeader({
  initialNotifications,
  viewerAccess,
}: {
  initialNotifications: NotificationListItem[];
  viewerAccess: ViewerAccessHeader;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Header");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const isLoading = false;

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = async (id: string) => {
    const previousNotifications = notifications;
    setNotifications(
      previousNotifications.map((notification) =>
        notification.id === id
          ? { ...notification, read: true }
          : notification,
      ),
    );

    const result = await markNotificationAsRead(id);
    if (result.success) {
      return;
    }

    setNotifications(previousNotifications);
    toast.error(getFriendlyActionError(result.error));
  };

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success(t("LogOut") + "...");
          router.replace("/sign-in");
        },
      },
    });
  };

  const isStudent = viewerAccess.authRole === "student";
  const selectedClassroomId = searchParams.get("classroomId");
  const profileHref = isStudent
    ? selectedClassroomId
      ? `/student/profile?classroomId=${selectedClassroomId}`
      : "/student/profile"
    : "/dashboard/profile";
  const settingsHref = isStudent ? "/student/settings" : "/dashboard/settings";
  const notificationsHref = isStudent ? "/student/notifications" : "/dashboard/notifications";

  return (
    <header
      className={cn(
        "h-16 border-b pl-16 pr-6 lg:px-6 flex items-center justify-between sticky top-0 z-10 transition-all duration-300",
        isStudent
          ? "border-[#e5e5e5] bg-[#ffffff] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
          : "border-[#EAEAEA] bg-white",
      )}
    >
      <div className="flex items-center gap-4 lg:hidden">
        <span className={cn("font-bold", isStudent ? "text-[#3c3c3c]" : "font-semibold text-[#292929]")}>
          Convyy
        </span>
      </div>

      <div className="flex-1 max-w-md hidden lg:block">
        <div className="relative">
          <Search
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
              isStudent ? "text-[#afafaf]" : "text-gray-400",
            )}
          />
          <input
            type="text"
            placeholder={t("Search")}
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-2xl border text-sm transition-all outline-none",
              isStudent
                ? "border-[#e5e5e5] bg-[#f7f7f7] text-[#3c3c3c] placeholder:text-[#afafaf] focus:border-[#58cc02] focus:ring-2 focus:ring-[#b7eb8f]"
                : "rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-gray-200",
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
            )}
          </button>

          {isNotificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsNotificationsOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-gray-100 shadow-xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{t("Notifications")}</h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs font-medium rounded-full">
                      {t("NewNotifications", { count: unreadCount })}
                    </span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {isLoading ? (
                    <div className="p-8 text-center">
                      <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-gray-500">{t("Notifications")}...</p>
                    </div>
                  ) : notifications.length > 0 ? (
                    notifications.map((notification: NotificationListItem) => (
                      <div
                        key={notification.id}
                        onClick={() => {
                          if (!notification.read) {
                            void handleMarkAsRead(notification.id);
                          }
                        }}
                        className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-l-2 ${!notification.read ? 'border-blue-500 bg-blue-50/30' : 'border-transparent'
                          }`}
                      >
                        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{notification.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(notification.createdAt).toLocaleDateString() === new Date().toLocaleDateString()
                            ? new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : new Date(notification.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-sm text-gray-500">{t("NoNotifications")}</p>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setIsNotificationsOpen(false);
                      router.push(notificationsHref);
                    }}
                    className="text-xs text-gray-600 hover:text-gray-900 font-medium w-full text-center py-1"
                  >
                    {t("ViewAll")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

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
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-sm ring-2 ring-white">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt={user.name ?? ""}
                    width={32}
                    height={32}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className={cn(
                      "w-full h-full flex items-center justify-center text-white text-xs font-bold",
                      isStudent
                        ? "bg-gradient-to-br from-[#58cc02] to-[#43c000]"
                        : "bg-gradient-to-br from-purple-500 to-indigo-600",
                    )}
                  >
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                )}
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
                    href={profileHref}
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <UserIcon className="w-4 h-4 text-gray-400" />
                    {t("Profile")}
                  </Link>
                  <Link
                    href={settingsHref}
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Settings className="w-4 h-4 text-gray-400" />
                    {t("Settings")}
                  </Link>

                  <div className="h-px bg-gray-100 my-1" />

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("LogOut")}
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
