import { relations } from "drizzle-orm";
import { users, accounts, sessions } from "./auth";
import { surveys } from "./surveys";
import { notifications } from "./notifications";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  surveys: many(surveys),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
