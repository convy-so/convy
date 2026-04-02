import { relations } from "drizzle-orm";
import { users, accounts, sessions } from "./auth";
import { surveys } from "./surveys";
import { notifications } from "./notifications";
import {
  classrooms,
  classroomStudents,
  learningTopics,
  topicMaterials,
} from "./learning";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  surveys: many(surveys),
  notifications: many(notifications),
  classrooms: many(classrooms, { relationName: "teacher_classrooms" }),
  classroomStudents: many(classroomStudents, {
    relationName: "student_classroom_memberships",
  }),
  invitedStudents: many(classroomStudents, {
    relationName: "student_classroom_invites_created",
  }),
  learningTopics: many(learningTopics, {
    relationName: "created_learning_topics",
  }),
  topicMaterials: many(topicMaterials, {
    relationName: "uploaded_topic_materials",
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
