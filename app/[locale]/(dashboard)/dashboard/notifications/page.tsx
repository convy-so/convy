import { NotificationsPageClient } from "@/shared/ui/workspace/notifications-page-client";
import { getNotificationsForCurrentUser } from "@/shared/http/page-data";

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
