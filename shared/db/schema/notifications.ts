import { pgTable, text, boolean, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { timestamps } from "./common";

export const notifications = pgTable(
    "notifications",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        message: text("message").notNull(),
        type: text("type").default("info"),
        link: text("link"),
        read: boolean("read").default(false).notNull(),
        ...timestamps,
    },
    (table) => [
        index("notifications_user_created_idx").on(table.userId, table.createdAt),
        index("notifications_user_read_created_idx").on(
            table.userId,
            table.read,
            table.createdAt,
        ),
    ],
);
