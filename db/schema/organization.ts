import { index, pgTable, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { users } from "./auth";
import { surveys } from "./surveys";

// Organization/Workspace tables (managed by Better Auth organization plugin)
export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const members = pgTable("member", {
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

export const invitations = pgTable("invitation", {
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

export const departments = pgTable(
  "departments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    headUserId: text("head_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("departments_organization_id_idx").on(table.organizationId),
    index("departments_head_user_id_idx").on(table.headUserId),
    unique("departments_org_name_unique").on(table.organizationId, table.name),
  ],
);

// Projects table
export const projects = pgTable(
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
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    // UI customization
    color: text("color"), // hex color for UI display
    icon: text("icon"), // emoji or icon name
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_organization_id_idx").on(table.organizationId),
    index("projects_department_id_idx").on(table.departmentId),
    index("projects_created_by_idx").on(table.userId), // createdBy is same as userId
  ]
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
  departments: many(departments),
}));

export const membersRelations = relations(members, ({ one }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [departments.organizationId],
    references: [organizations.id],
  }),
  headUser: one(users, {
    fields: [departments.headUserId],
    references: [users.id],
  }),
  projects: many(projects),
  surveys: many(surveys),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [projects.departmentId],
    references: [departments.id],
  }),
  surveys: many(surveys),
}));

export {
  // All tables and relations are now exported directly using 'export const'
};
