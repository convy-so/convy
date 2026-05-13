"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ActionResult, withErrorHandling, UnauthorizedError, NotFoundError } from "@/lib/action-wrapper";

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

        revalidatePath("/", "layout");
        return { success: true, data: undefined };
    }, "markNotificationAsRead");
}

export async function markAllNotificationsAsRead(): Promise<ActionResult<number>> {
    return withErrorHandling(async () => {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) throw new UnauthorizedError();

        const updatedRows = await getDb()
            .update(notifications)
            .set({ read: true })
            .where(and(eq(notifications.userId, session.user.id), eq(notifications.read, false)))
            .returning({ id: notifications.id });

        revalidatePath("/", "layout");
        return { success: true, data: updatedRows.length };
    }, "markAllNotificationsAsRead");
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
        revalidatePath("/", "layout");
        return { success: true, data: undefined };
    }, "createNotification");
}
