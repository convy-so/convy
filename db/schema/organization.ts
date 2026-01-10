import { index, pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { users } from "./auth";
import { surveys } from "./surveys";

// Organization/Workspace tables (managed by Better Auth organization plugin)
const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

const members = pgTable("member", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'owner' | 'member'
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

const invitations = pgTable("invitation", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull(), // 'pending' | 'accepted' | 'rejected' | 'cancelled'
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

// Projects table
const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    name: text("name").notNull(),
    description: text("description"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    // UI customization
    color: text("color"), // hex color for UI display
    icon: text("icon"), // emoji or icon name
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_organization_id_idx").on(table.organizationId),
    index("projects_created_by_idx").on(table.userId), // createdBy is same as userId
  ]
);

const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
}));

const membersRelations = relations(members, ({ one }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
}));

const invitationsRelations = relations(invitations, ({ one }) => ({
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
}));

const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  surveys: many(surveys),
}));

export {
  organizations,
  members,
  invitations,
  projects,
  organizationsRelations,
  membersRelations,
  invitationsRelations,
  projectsRelations,
};
