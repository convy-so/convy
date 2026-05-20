import {
  boolean,
  check,
  index,
  pgTable,
  pgEnum,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { timestamps } from "./common";
import { userRoleEnum } from "./enums";
export {
  users,
  accounts,
  sessions,
  verificationTokens,
  expertInvitationStatusEnum,
  expertInvitations,
  accountsRelations,
  sessionsRelations,
};

const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    name: text("name").notNull(),
    image: text("image"),
    role: userRoleEnum("role").notNull(),
    banned: boolean("banned").default(false).notNull(),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", {
      withTimezone: true,
      mode: "date",
    }),
    uiLocale: text("ui_locale").default("en"),
    preferredLanguage: text("preferred_language").default("en"),
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    check("users_email_lowercase_check", sql`lower(${table.email}) = ${table.email}`),
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
    impersonatedBy: text("impersonated_by"),
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

const expertInvitationStatusEnum = pgEnum("expert_invitation_status", [
  "pending",
  "completed",
  "cancelled",
]);

const expertInvitations = pgTable(
  "expert_invitations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    invitedUserId: text("invited_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    locale: text("locale").default("en").notNull(),
    status: expertInvitationStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastSentAt: timestamp("last_sent_at", {
      withTimezone: true,
      mode: "date",
    }),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("expert_invitations_invited_user_id_idx").on(table.invitedUserId),
    index("expert_invitations_invited_by_user_id_idx").on(table.invitedByUserId),
    index("expert_invitations_invited_email_idx").on(table.invitedEmail),
    index("expert_invitations_status_idx").on(table.status),
    uniqueIndex("expert_invitations_pending_email_unique")
      .on(table.invitedEmail)
      .where(sql`${table.status} = 'pending'`),
    check(
      "expert_invitations_email_lowercase_check",
      sql`lower(${table.invitedEmail}) = ${table.invitedEmail}`,
    ),
  ],
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
