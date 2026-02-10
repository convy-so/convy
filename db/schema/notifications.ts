import { pgTable, text, boolean } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { timestamps } from "./common";

export const notifications = pgTable("notifications", {
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
});
