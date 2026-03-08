import { index, pgTable, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
