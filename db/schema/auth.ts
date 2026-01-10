import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { userRoleEnum } from "./enums";
export { users, userEmails, accounts, sessions, verificationTokens, accountsRelations, sessionsRelations };

const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    name: text("name").notNull(),
    image: text("image"),
    role: userRoleEnum("role").default("user").notNull(),
  },
  (table) => [unique("users_email_unique").on(table.email)]
);

const userEmails = pgTable(
  "user_emails",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    verificationToken: text("verification_token"), 
  },
  (table) => [
    unique("user_emails_email_unique").on(table.email),
    index("user_emails_user_id_idx").on(table.userId),
  ]
);

const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    scope: text("scope"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    password: text("password"),
  },
  (table) => [
    unique("accounts_provider_account_unique").on(
      table.providerId,
      table.accountId
    ),
    index("accounts_user_id_idx").on(table.userId),
  ]
);

const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
  },
  (table) => [
    unique("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ]
);

const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
