import {
  index,
  pgTable,
  text,
  timestamp,
  jsonb,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { users } from "./auth";
import { surveys } from "./surveys";

export const workspaceTypes = ["collaborative", "institutional"] as const;
export type WorkspaceType = (typeof workspaceTypes)[number];

export const workspaceRoles = [
  "owner",
  "admin",
  "teacher",
  "staff_viewer",
] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const departmentMembershipRoles = ["admin", "member"] as const;
export type DepartmentMembershipRole = (typeof departmentMembershipRoles)[number];

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
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const workspaceProfiles = pgTable(
  "workspace_profiles",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").$type<WorkspaceType>().notNull().default("collaborative"),
    departmentsEnabled: boolean("departments_enabled").notNull().default(false),
    staffRolesEnabled: boolean("staff_roles_enabled").notNull().default(false),
    privacyControlsEnabled: boolean("privacy_controls_enabled")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("workspace_profiles_type_idx").on(table.type)],
);

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
  },
  (table) => [
    index("departments_organization_id_idx").on(table.organizationId),
    unique("departments_org_name_unique").on(table.organizationId, table.name),
  ],
);

export const departmentMemberships = pgTable(
  "department_memberships",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<DepartmentMembershipRole>().notNull().default("member"),
  },
  (table) => [
    index("department_memberships_department_id_idx").on(table.departmentId),
    index("department_memberships_user_id_idx").on(table.userId),
    unique("department_memberships_unique").on(table.departmentId, table.userId),
  ],
);

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
    index("folders_user_id_idx").on(table.userId),
    index("folders_organization_id_idx").on(table.organizationId),
    index("folders_department_id_idx").on(table.departmentId),
    index("folders_created_by_idx").on(table.userId),
  ]
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
  departments: many(departments),
  profile: many(workspaceProfiles),
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
  memberships: many(departmentMemberships),
  folders: many(folders),
  surveys: many(surveys),
}));

export const workspaceProfilesRelations = relations(
  workspaceProfiles,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [workspaceProfiles.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const departmentMembershipsRelations = relations(
  departmentMemberships,
  ({ one }) => ({
    department: one(departments, {
      fields: [departmentMemberships.departmentId],
      references: [departments.id],
    }),
    user: one(users, {
      fields: [departmentMemberships.userId],
      references: [users.id],
    }),
  }),
);

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [folders.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [folders.departmentId],
    references: [departments.id],
  }),
  surveys: many(surveys),
}));

export const projects = folders;
export const projectsRelations = foldersRelations;

export {
  // All tables and relations are now exported directly using 'export const'
};
