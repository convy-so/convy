import { relations } from "drizzle-orm";
import { users, accounts, sessions } from "./auth";
import { surveys } from "./surveys";
import { notifications } from "./notifications";
import {
  classrooms,
  classroomInvitations,
  classroomStudents,
  courses,
  lessons,
  lessonMaterials,
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
  classroomInvitationsSent: many(classroomInvitations, {
    relationName: "classroom_invitations_created",
  }),
  classroomInvitationsAccepted: many(classroomInvitations, {
    relationName: "classroom_invitations_accepted",
  }),
  courses: many(courses, {
    relationName: "created_courses",
  }),
  lessons: many(lessons, {
    relationName: "created_lessons",
  }),
  lessonMaterials: many(lessonMaterials, {
    relationName: "uploaded_lesson_materials",
  }),
}));

export const classroomInvitationsRelations = relations(
  classroomInvitations,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [classroomInvitations.classroomId],
      references: [classrooms.id],
    }),
    invitedBy: one(users, {
      fields: [classroomInvitations.invitedByUserId],
      references: [users.id],
      relationName: "classroom_invitations_created",
    }),
    acceptedBy: one(users, {
      fields: [classroomInvitations.acceptedByUserId],
      references: [users.id],
      relationName: "classroom_invitations_accepted",
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

