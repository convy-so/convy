"use server";

import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ActionResult } from "./workspace";

type NotificationRecord = typeof notifications.$inferSelect;

export async function getNotifications(): Promise<ActionResult<NotificationRecord[]>> {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) return { success: false, error: "Unauthorized" };

        const userNotifications = await getDb().query.notifications.findMany({
            where: eq(notifications.userId, session.user.id),
            orderBy: [desc(notifications.createdAt)],
            limit: 20,
        });

        return {
            success: true,
            data: userNotifications,
        };
    } catch (error) {
        console.error("Error getting notifications:", error);
        return {
            success: false,
            error: "Failed to get notifications",
        };
    }
}

export async function markNotificationAsRead(id: string): Promise<ActionResult<void>> {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) return { success: false, error: "Unauthorized" };

        const updatedRows = await getDb()
            .update(notifications)
            .set({ read: true })
            .where(and(eq(notifications.id, id), eq(notifications.userId, session.user.id)))
            .returning({ id: notifications.id });

        if (updatedRows.length === 0) {
            return { success: false, error: "Notification not found" };
        }

        return { success: true, data: undefined };
    } catch (error) {
        console.error("Error marking notification as read:", error);
        return { success: false, error: "Failed to mark as read" };
    }
}

export async function createNotification(userId: string, title: string, message: string, type: "info" | "success" | "warning" | "error" = "info", link?: string) {
    await getDb().insert(notifications).values({
        id: nanoid(),
        userId,
        title,
        message,
        type,
        link,
        createdAt: new Date(),
    });
}
