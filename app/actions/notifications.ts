"use server";

import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ActionResult, withErrorHandling, UnauthorizedError, NotFoundError } from "@/lib/action-wrapper";

type NotificationRecord = typeof notifications.$inferSelect;

export async function getNotifications(): Promise<ActionResult<NotificationRecord[]>> {
    return withErrorHandling(async () => {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) throw new UnauthorizedError();

        const userNotifications = await getDb().query.notifications.findMany({
            where: eq(notifications.userId, session.user.id),
            orderBy: [desc(notifications.createdAt)],
            limit: 20,
        });

        return {
            success: true,
            data: userNotifications,
        };
    }, "getNotifications");
}

export async function markNotificationAsRead(id: string): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) throw new UnauthorizedError();

        const updatedRows = await getDb()
            .update(notifications)
            .set({ read: true })
            .where(and(eq(notifications.id, id), eq(notifications.userId, session.user.id)))
            .returning({ id: notifications.id });

        if (updatedRows.length === 0) {
            throw new NotFoundError("Notification");
        }

        return { success: true, data: undefined };
    }, "markNotificationAsRead");
}

export async function createNotification(
    userId: string,
    title: string,
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
    link?: string,
): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        await getDb().insert(notifications).values({
            id: nanoid(),
            userId,
            title,
            message,
            type,
            link,
            createdAt: new Date(),
        });
        return { success: true, data: undefined };
    }, "createNotification");
}
