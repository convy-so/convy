"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/shared/db";
import { notifications } from "@/shared/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ActionResult, withErrorHandling, UnauthorizedError, NotFoundError } from "@/shared/http/action-result";
import { requireVerifiedSession } from "@/features/auth/public-server";

export async function markNotificationAsRead(id: string): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const session = await requireVerifiedSession();
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
        const session = await requireVerifiedSession();
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
