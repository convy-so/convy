import {
  index,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

import { timestamps } from "./common";
import { users } from "./auth";
import { classroomStudents } from "./learning";
import { FEEDBACK_DEFAULTS } from "@/shared/feedback/constants";

export const platformFeedback = pgTable(
  "platform_feedback",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    classroomStudentId: text("classroom_student_id").references(
      () => classroomStudents.id,
      {
        onDelete: "set null",
      },
    ),
    submitterRole: text("submitter_role").notNull(),
    kind: text("kind").notNull(),
    sourceArea: text("source_area").notNull(),
    status: text("status").default(FEEDBACK_DEFAULTS.statusOpen).notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    contactEmail: text("contact_email"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("platform_feedback_status_idx").on(table.status, table.createdAt),
    index("platform_feedback_kind_idx").on(table.kind),
    index("platform_feedback_role_idx").on(table.submitterRole),
    index("platform_feedback_user_idx").on(table.userId),
    index("platform_feedback_student_idx").on(table.classroomStudentId),
  ],
);
