import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import { classrooms, classroomStudents, platformFeedback } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";
import { isExpertRole } from "@/lib/auth/roles";

export const feedbackRoles = ["teacher", "student", "expert"] as const;
export const feedbackKinds = ["complaint", "suggestion"] as const;
export const feedbackSourceAreas = [
  "platform",
  "survey",
  "tutoring",
  "classroom",
  "expert_ops",
  "other",
] as const;

export type FeedbackRole = (typeof feedbackRoles)[number];
export type FeedbackKind = (typeof feedbackKinds)[number];
export type FeedbackSourceArea = (typeof feedbackSourceAreas)[number];

export const feedbackSubmissionSchema = z.object({
  submitterRole: z.enum(feedbackRoles),
  kind: z.enum(feedbackKinds),
  sourceArea: z.enum(feedbackSourceAreas),
  subject: z.string().trim().min(4).max(140),
  message: z.string().trim().min(20).max(4000),
  contactEmail: z.string().email().optional().or(z.literal("")),
  page: z.string().trim().max(300).optional(),
});

export async function resolveFeedbackFormContext(user: AuthUser) {
  const [teacherClassroom, studentMembership] = await Promise.all([
    getDb().query.classrooms.findFirst({
      where: eq(classrooms.teacherUserId, user.id),
      columns: { id: true },
    }),
    getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.userId, user.id),
        eq(classroomStudents.inviteStatus, "accepted"),
      ),
      columns: { id: true },
      orderBy: [desc(classroomStudents.updatedAt)],
    }),
  ]);

  const allowedRoles: FeedbackRole[] = [];
  if (teacherClassroom) {
    allowedRoles.push("teacher");
  }
  if (studentMembership) {
    allowedRoles.push("student");
  }
  if (isExpertRole(user)) {
    allowedRoles.push("expert");
  }

  if (allowedRoles.length === 0) {
    allowedRoles.push("teacher");
  }

  const defaultRole: FeedbackRole =
    allowedRoles.includes("expert")
      ? "expert"
      : allowedRoles.includes("teacher")
        ? "teacher"
        : "student";

  return {
    allowedRoles,
    defaultRole,
    primaryClassroomStudentId: studentMembership?.id ?? null,
    contactEmail: user.email ?? "",
  };
}

export async function submitPlatformFeedback(
  user: AuthUser,
  input: z.infer<typeof feedbackSubmissionSchema>,
) {
  const parsed = feedbackSubmissionSchema.parse(input);
  const context = await resolveFeedbackFormContext(user);

  if (!context.allowedRoles.includes(parsed.submitterRole)) {
    throw new Error("You do not have access to submit feedback for that role.");
  }

  const [created] = await getDb()
    .insert(platformFeedback)
    .values({
      id: nanoid(),
      userId: user.id,
      classroomStudentId:
        parsed.submitterRole === "student"
          ? context.primaryClassroomStudentId
          : null,
      submitterRole: parsed.submitterRole,
      kind: parsed.kind,
      sourceArea: parsed.sourceArea,
      status: "open",
      subject: parsed.subject,
      message: parsed.message,
      contactEmail: parsed.contactEmail || context.contactEmail || null,
      metadata: parsed.page ? { page: parsed.page } : {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}
