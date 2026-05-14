import { NotificationsPageClient } from "@/components/dashboard/notifications-page-client";
import { getNotificationsForCurrentUser } from "@/lib/server/app-queries";

export default async function NotificationsDashboardPage() {
  const notifications = await getNotificationsForCurrentUser();

  return (
    <NotificationsPageClient
      initialNotifications={notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type:
          notification.type === "success" ||
          notification.type === "warning" ||
          notification.type === "error"
            ? notification.type
            : "info",
        read: notification.read,
        link: notification.link ?? null,
        createdAt: notification.createdAt?.toISOString() ?? null,
      }))}
    />
  );
}
