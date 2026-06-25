"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertCircle,
  Info,
  CalendarClock,
  Loader2,
  MousePointerClick,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/app/actions/notifications";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { useRouter } from "@/i18n/routing";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  link: string | null;
  createdAt: string | null;
};

export function NotificationsPageClient({
  initialNotifications,
}: {
  initialNotifications: NotificationItem[];
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const [isMarkingAll, startMarkAllTransition] = useTransition();

  const handleNotificationClick = async (
    id: string,
    link: string | null,
    read: boolean,
  ) => {
    if (!read) {
      setPendingIds((current) => ({ ...current, [id]: true }));

      try {
        const result = await markNotificationAsRead(id);
        if (!result.success) {
          throw new Error(getFriendlyActionError(result.error));
        }

        setNotifications((current) =>
          current.map((notification) =>
            notification.id === id
              ? { ...notification, read: true }
              : notification,
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update notification",
        );
      } finally {
        setPendingIds((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    }

    if (link) {
      router.push(link);
    }
  };

  const markAllRead = () => {
    const unreadIds = notifications.filter((notification) => !notification.read);
    if (unreadIds.length === 0) {
      toast("All caught up!");
      return;
    }

    startMarkAllTransition(async () => {
      try {
        const result = await markAllNotificationsAsRead();
        if (!result.success) {
          throw new Error(getFriendlyActionError(result.error));
        }

        setNotifications((current) =>
          current.map((notification) => ({ ...notification, read: true })),
        );
        toast.success("Marked all as read");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to mark notifications as read",
        );
      }
    });
  };

  if (initialNotifications.length === 0 && notifications.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Header onMarkAllRead={markAllRead} isPending={isMarkingAll} />
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex h-[400px] flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <Bell className="h-8 w-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              You&apos;re all caught up!
            </h3>
            <p className="mt-2 max-w-sm text-sm text-gray-500">
              No new notifications right now. When you receive alerts,
              collaborations or updates, they&apos;ll appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Header onMarkAllRead={markAllRead} isPending={isMarkingAll} />

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="min-h-[500px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            <AnimatePresence>
              {notifications.map((notification, index) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: Math.min(index * 0.05, 0.5) }}
                  onClick={() =>
                    void handleNotificationClick(
                      notification.id,
                      notification.link,
                      notification.read,
                    )
                  }
                  className={`group relative flex items-start gap-4 p-5 transition-colors hover:bg-gray-50 ${
                    notification.link ? "cursor-pointer" : ""
                  } ${!notification.read ? "bg-indigo-50/30" : ""}`}
                >
                  <div
                    className={`mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                      notification.type === "error"
                        ? "bg-red-100 text-red-600"
                        : notification.type === "success"
                          ? "bg-emerald-100 text-emerald-600"
                          : notification.type === "warning"
                            ? "bg-amber-100 text-amber-600"
                            : "bg-indigo-100 text-indigo-600"
                    }`}
                  >
                    {notification.type === "error" ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : notification.type === "success" ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Info className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-10">
                    <h4
                      className={`truncate text-base font-semibold ${
                        !notification.read ? "text-gray-900" : "text-gray-700"
                      }`}
                    >
                      {notification.title}
                    </h4>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">
                      {notification.message}
                    </p>

                    <div className="mt-3 flex items-center gap-4 text-xs font-medium text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {notification.createdAt
                          ? formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                            })
                          : ""}
                      </span>
                      {notification.link ? (
                        <span className="flex items-center gap-1 text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
                          <MousePointerClick className="h-3.5 w-3.5" />
                          View Details
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {pendingIds[notification.id] ? (
                    <div className="absolute right-6 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    </div>
                  ) : !notification.read ? (
                    <div className="absolute right-6 top-1/2 -translate-y-1/2">
                      <div className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-sm" />
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Header({
  onMarkAllRead,
  isPending,
}: {
  onMarkAllRead: () => void;
  isPending: boolean;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
    >
      <div>
        <h1 className="flex items-center gap-3 text-4xl font-extrabold tracking-tight text-gray-900">
          <BellRing className="h-8 w-8 text-indigo-600" />
          Notifications
        </h1>
        <p className="mt-3 text-base text-gray-500">
          View your system alerts, updates, and classroom notifications.
        </p>
      </div>

      <button
        onClick={onMarkAllRead}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all active:scale-95 hover:bg-gray-50 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-gray-500" />
        )}
        Mark all as read
      </button>
    </motion.div>
  );
}
