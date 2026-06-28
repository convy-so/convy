import { index, pgTable, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { timestamps } from "./common";
import { users } from "./auth";

export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    name: text("name").notNull(),
    description: text("description"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    color: text("color"),
    icon: text("icon"),
  },
  (table) => [
    index("folders_user_id_idx").on(table.userId),
    index("folders_created_by_idx").on(table.userId),
  ],
);

export const foldersRelations = relations(folders, ({ one }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
}));
