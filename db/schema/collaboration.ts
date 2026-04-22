import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { users } from "./auth";
import { surveys } from "./surveys";

export const surveyCreationComments = pgTable(
  "survey_creation_comments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
  },
  (table) => [
    index("survey_creation_comments_survey_id_idx").on(table.surveyId),
    index("survey_creation_comments_user_id_idx").on(table.userId),
  ],
);

export const surveyCreationCommentsRelations = relations(
  surveyCreationComments,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyCreationComments.surveyId],
      references: [surveys.id],
    }),
    user: one(users, {
      fields: [surveyCreationComments.userId],
      references: [users.id],
    }),
  }),
);

export const surveyEditors = pgTable(
  "survey_editors",
  {
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.surveyId, table.userId] }),
    index("survey_editors_survey_id_idx").on(table.surveyId),
    index("survey_editors_user_id_idx").on(table.userId),
  ],
);

export const surveyEditorRequests = pgTable(
  "survey_editor_requests",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    requestedAt: timestamp("requested_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),
    resolvedBy: text("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("survey_editor_requests_survey_id_idx").on(table.surveyId),
    index("survey_editor_requests_requester_id_idx").on(table.requesterId),
    index("survey_editor_requests_status_idx").on(table.status),
  ],
);

export const surveyCollaborationComments = pgTable(
  "survey_collaboration_comments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    contextType: text("context_type").notNull(),
    contextId: text("context_id").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("survey_collab_comments_survey_id_idx").on(table.surveyId),
    index("survey_collab_comments_context_idx").on(
      table.surveyId,
      table.contextType,
      table.contextId,
    ),
    index("survey_collab_comments_author_id_idx").on(table.authorId),
  ],
);

export const surveyEditLeases = pgTable(
  "survey_edit_leases",
  {
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    holderUserId: text("holder_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    holderSessionId: text("holder_session_id"),
    leaseToken: text("lease_token").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.surveyId, table.stage] }),
    index("survey_edit_leases_holder_user_id_idx").on(table.holderUserId),
    index("survey_edit_leases_expires_at_idx").on(table.expiresAt),
  ],
);

export const surveyRevisions = pgTable("survey_revisions", {
  surveyId: text("survey_id")
    .primaryKey()
    .references(() => surveys.id, { onDelete: "cascade" }),
  workspaceRevision: integer("workspace_revision").default(0).notNull(),
  surveyRevision: integer("survey_revision").default(0).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const workspaceRevisions = pgTable("workspace_revisions", {
  workspaceId: text("workspace_id").primaryKey(),
  revision: integer("revision").default(0).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const collaborationEvents = pgTable(
  "collaboration_events",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    workspaceId: text("workspace_id"),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    scope: text("scope").notNull(),
    revision: integer("revision").notNull(),
    eventType: text("event_type").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("collaboration_events_workspace_idx").on(
      table.workspaceId,
      table.revision,
    ),
    index("collaboration_events_survey_idx").on(table.surveyId, table.revision),
    index("collaboration_events_event_type_idx").on(table.eventType),
  ],
);

export const workspaceOutbox = pgTable(
  "workspace_outbox",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    workspaceId: text("workspace_id"),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    scope: text("scope").notNull(),
    channel: text("channel").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    claimOwner: text("claim_owner"),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    claimExpiresAt: timestamp("claim_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishAttempts: integer("publish_attempts").default(0).notNull(),
    lastError: text("last_error"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("workspace_outbox_scope_idx").on(table.scope, table.publishedAt),
    index("workspace_outbox_workspace_idx").on(table.workspaceId, table.publishedAt),
    index("workspace_outbox_survey_idx").on(table.surveyId, table.publishedAt),
    index("workspace_outbox_unpublished_created_idx").on(
      table.publishedAt,
      table.createdAt,
    ),
    index("workspace_outbox_reclaim_idx").on(
      table.publishedAt,
      table.claimExpiresAt,
      table.createdAt,
    ),
  ],
);

export const surveyEditorsRelations = relations(surveyEditors, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyEditors.surveyId],
    references: [surveys.id],
  }),
  user: one(users, {
    fields: [surveyEditors.userId],
    references: [users.id],
  }),
  grantedByUser: one(users, {
    fields: [surveyEditors.grantedBy],
    references: [users.id],
  }),
}));

export const surveyEditorRequestsRelations = relations(
  surveyEditorRequests,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyEditorRequests.surveyId],
      references: [surveys.id],
    }),
    requester: one(users, {
      fields: [surveyEditorRequests.requesterId],
      references: [users.id],
    }),
    resolvedByUser: one(users, {
      fields: [surveyEditorRequests.resolvedBy],
      references: [users.id],
    }),
  }),
);

export const surveyCollaborationCommentsRelations = relations(
  surveyCollaborationComments,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyCollaborationComments.surveyId],
      references: [surveys.id],
    }),
    author: one(users, {
      fields: [surveyCollaborationComments.authorId],
      references: [users.id],
    }),
  }),
);

export const surveyEditLeasesRelations = relations(
  surveyEditLeases,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyEditLeases.surveyId],
      references: [surveys.id],
    }),
    holder: one(users, {
      fields: [surveyEditLeases.holderUserId],
      references: [users.id],
    }),
  }),
);

export const surveyRevisionsRelations = relations(
  surveyRevisions,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyRevisions.surveyId],
      references: [surveys.id],
    }),
  }),
);

export const workspaceRevisionsRelations = relations(
  workspaceRevisions,
  () => ({}),
);

export const collaborationEventsRelations = relations(
  collaborationEvents,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [collaborationEvents.surveyId],
      references: [surveys.id],
    }),
    actor: one(users, {
      fields: [collaborationEvents.actorId],
      references: [users.id],
    }),
  }),
);

export const workspaceOutboxRelations = relations(workspaceOutbox, ({ one }) => ({
  survey: one(surveys, {
    fields: [workspaceOutbox.surveyId],
    references: [surveys.id],
  }),
}));
