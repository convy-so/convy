"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import {
  classroomAccessRequests,
  classroomStudents,
  classrooms,
  classroomTeacherAccess,
  learningInterventions,
  departments,
  learningTopics,
  members,
  surveyConversations,
  surveys,
  users,
} from "@/db/schema";
import {
  getPersonalClassroomDirectory,
  getTeacherClassroomAccess,
  getWorkspaceClassroomDirectory,
} from "@/lib/learning/access";
import { normalizeGradeBand } from "@/lib/learning/runtime";
import { deriveSubjectInfo } from "@/lib/learning/patterns";
import {
  learningOutcomeDefinitionSchema,
  topicSourceBoundarySchema,
} from "@/lib/learning/types";
import { isWorkspaceMember } from "@/lib/workspace-access";
import { provisionManagedStudentAccount } from "@/lib/learning/provisioning";
import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";
import type { AppLocale } from "@/lib/i18n/config";
import { getWorkspaceLocaleSettings } from "@/lib/i18n/workspace-settings";
import { getTeachingContext } from "@/lib/teaching-context";

const appLocaleSchema = z.enum(["en", "fr", "de", "es", "it"]);

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const createClassroomSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  subject: z.string().optional(),
  gradeLabel: z.string().min(1),
  departmentId: z.string().optional(),
  defaultContentLocale: appLocaleSchema.optional(),
});

const inviteStudentSchema = z.object({
  classroomId: z.string().min(1),
  fullName: z.string().min(2),
  email: z.string().email(),
});

const bulkInviteStudentsSchema = z.object({
  classroomId: z.string().min(1),
  students: z
    .array(
      z.object({
        fullName: z.string().min(2),
        email: z.string().email(),
      }),
    )
    .min(1),
});

const createLearningTopicSchema = z.object({
  classroomId: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional(),
  subject: z.string().optional(),
  subjectKey: z.string().optional(),
  subjectLabel: z.string().optional(),
  learningOutcomes: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        title: z.string().min(1),
        description: z.string().min(1),
        evidenceSignals: z.array(z.string()).optional(),
        masteryThreshold: z.number().min(0).max(100).optional(),
      }),
    )
    .min(1),
  sourceBoundary: topicSourceBoundarySchema.partial().optional(),
  contentLocale: appLocaleSchema.optional(),
});

const classroomAccessRequestSchema = z.object({
  classroomId: z.string().min(1),
  message: z.string().max(500).optional(),
});

const classroomAccessDecisionSchema = z.object({
  classroomId: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

const classroomCollaboratorRevocationSchema = z.object({
  classroomId: z.string().min(1),
  teacherUserId: z.string().min(1),
});

const classroomCollaboratorInviteSchema = z.object({
  classroomId: z.string().min(1),
  email: z.string().email(),
});

const learningInterventionSchema = z.object({
  classroomId: z.string().min(1),
  classroomStudentId: z.string().min(1),
  topicId: z.string().min(1).optional(),
  interventionType: z.enum(["reteach", "check_in", "practice", "family_follow_up"]),
  priority: z.enum(["low", "medium", "high"]),
  title: z.string().min(3),
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

const learningInterventionUpdateSchema = z.object({
  interventionId: z.string().min(1),
  status: z.enum(["planned", "in_progress", "completed", "dismissed"]),
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

type ClassroomAccessRecord = NonNullable<
  Awaited<ReturnType<typeof getTeacherClassroomAccess>>
>;

type LearningInterventionRecord = {
  id: string;
  classroomId: string;
  classroomStudentId: string;
  topicId: string | null;
  interventionType: "reteach" | "check_in" | "practice" | "family_follow_up";
  priority: "low" | "medium" | "high";
  status: "planned" | "in_progress" | "completed" | "dismissed";
  title: string;
  notes: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    fullName: string;
    email: string;
  };
};

async function requireTeachingSession() {
  const context = await getTeachingContext();

  return {
    context,
    session: context.session,
    organizationId: context.organizationId,
  };
}

async function requireWorkspaceContext() {
  const { context, session, organizationId } = await requireTeachingSession();

  if (context.scope !== "workspace" || !organizationId) {
    throw new Error("Please open a workspace before using this feature.");
  }

  const canAccess = await isWorkspaceMember(session.user.id, organizationId);
  if (!canAccess) {
    throw new Error("Unauthorized");
  }

  return { context, session, organizationId };
}

async function ensureClassroomOwnerAccess(
  userId: string,
  classroomId: string,
) {
  const classroomAccess = await getTeacherClassroomAccess(userId, classroomId);

  if (!classroomAccess) {
    throw new Error("Classroom not found");
  }

  if (classroomAccess.accessLevel !== "owner") {
    throw new Error("Only the classroom owner can perform this action.");
  }

  return classroomAccess;
}

async function inviteManagedStudentToClassroom(params: {
  classroomAccess: ClassroomAccessRecord;
  invitedByUserId: string;
  fullName: string;
  email: string;
}) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const normalizedFullName = params.fullName.trim();

  const existingStudent = await getDb().query.classroomStudents.findFirst({
    where: and(
      eq(classroomStudents.classroomId, params.classroomAccess.id),
      eq(classroomStudents.email, normalizedEmail),
    ),
  });

  if (existingStudent) {
    throw new Error("That student email is already attached to this classroom.");
  }

  const existingUser = await getDb().query.users.findFirst({
    where: sql`lower(${users.email}) = ${normalizedEmail}`,
  });

  if (existingUser) {
    const existingManagedSeat = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.userId, existingUser.id),
        eq(classroomStudents.email, normalizedEmail),
      ),
    });

    if (!existingManagedSeat) {
      throw new Error(
        "That email already belongs to an existing account and cannot be auto-managed as a student.",
      );
    }
  }

  const studentId = nanoid();
  await getDb().insert(classroomStudents).values({
    id: studentId,
    classroomId: params.classroomAccess.id,
    invitedByUserId: params.invitedByUserId,
    fullName: normalizedFullName,
    email: normalizedEmail,
    inviteStatus: "pending",
    onboardingStatus: "interest_profile_pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const provisioned = await provisionManagedStudentAccount({
    classroomStudentId: studentId,
  });

  return {
    id: studentId,
    classroomId: params.classroomAccess.id,
    fullName: normalizedFullName,
    email: provisioned.email,
    inviteStatus: "invited",
  };
}

function formatLearningIntervention(record: {
  id: string;
  classroomId: string;
  classroomStudentId: string;
  topicId: string | null;
  interventionType: string;
  priority: string;
  status: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  classroomStudent: {
    id: string;
    fullName: string;
    email: string;
  };
}): LearningInterventionRecord {
  return {
    id: record.id,
    classroomId: record.classroomId,
    classroomStudentId: record.classroomStudentId,
    topicId: record.topicId,
    interventionType:
      record.interventionType === "check_in" ||
      record.interventionType === "practice" ||
      record.interventionType === "family_follow_up"
        ? record.interventionType
        : "reteach",
    priority:
      record.priority === "low" || record.priority === "high"
        ? record.priority
        : "medium",
    status:
      record.status === "in_progress" ||
      record.status === "completed" ||
      record.status === "dismissed"
        ? record.status
        : "planned",
    title: record.title,
    notes: record.notes,
    dueAt: record.dueAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    student: {
      id: record.classroomStudent.id,
      fullName: record.classroomStudent.fullName,
      email: record.classroomStudent.email,
    },
  };
}

export async function createClassroomAction(
  input: z.infer<typeof createClassroomSchema>,
): Promise<
  ActionResult<{
    id: string;
    title: string;
    gradeBand: string;
    gradeLabel: string;
    accessLevel: "owner";
    defaultContentLocale: AppLocale;
    departmentId: string | null;
    departmentName: string | null;
  }>
> {
  try {
    const body = createClassroomSchema.parse(input);
    const { session, organizationId } = await requireTeachingSession();
    const classroomId = nanoid();
    const accessId = nanoid();
    const now = new Date();
    const gradeBand = normalizeGradeBand(body.gradeLabel);
    const departmentId = body.departmentId?.trim() || null;
    const defaultContentLocale = await resolveUiLocaleForContentCreation({
      explicitLocale: body.defaultContentLocale ?? null,
      session,
      workspaceId: organizationId ?? undefined,
    });
    const workspaceSettings = organizationId
      ? await getWorkspaceLocaleSettings(organizationId)
      : null;
    let departmentName: string | null = null;

    if (
      body.defaultContentLocale &&
      workspaceSettings &&
      !workspaceSettings.allowedLocales.includes(body.defaultContentLocale)
    ) {
      return {
        success: false,
        error: "That language is not enabled for the active workspace.",
      };
    }

    if (departmentId && !organizationId) {
      return {
        success: false,
        error: "Departments are only available inside workspaces.",
      };
    }

    if (departmentId && organizationId) {
      const department = await getDb().query.departments.findFirst({
        where: and(
          eq(departments.id, departmentId),
          eq(departments.organizationId, organizationId),
        ),
      });

      if (!department) {
        return {
          success: false,
          error: "Selected department does not belong to this workspace.",
        };
      }

      departmentName = department.name;
    }

    await getDb().transaction(async (tx) => {
      await tx.insert(classrooms).values({
        id: classroomId,
        organizationId,
        departmentId,
        teacherUserId: session.user.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        subject: body.subject?.trim() || null,
        defaultContentLocale,
        gradeBand,
        gradeLabel: body.gradeLabel.trim(),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(classroomTeacherAccess).values({
        id: accessId,
        classroomId,
        teacherUserId: session.user.id,
        grantedByUserId: session.user.id,
        accessLevel: "owner",
        createdAt: now,
        updatedAt: now,
      });
    });

    return {
      success: true,
      data: {
        id: classroomId,
        title: body.title.trim(),
        gradeBand,
        gradeLabel: body.gradeLabel.trim(),
        accessLevel: "owner",
        defaultContentLocale,
        departmentId,
        departmentName,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create classroom",
    };
  }
}

export async function inviteStudentToClassroomAction(
  input: z.infer<typeof inviteStudentSchema>,
): Promise<
  ActionResult<{
    id: string;
    classroomId: string;
    fullName: string;
    email: string;
    inviteStatus: string;
  }>
> {
  try {
    const body = inviteStudentSchema.parse(input);
    const { session } = await requireTeachingSession();
    const classroomAccess = await ensureClassroomOwnerAccess(
      session.user.id,
      body.classroomId,
    );
    const invitedStudent = await inviteManagedStudentToClassroom({
      classroomAccess,
      invitedByUserId: session.user.id,
      fullName: body.fullName,
      email: body.email,
    });

    return {
      success: true,
      data: invitedStudent,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to invite student",
    };
  }
}

export async function bulkInviteStudentsToClassroomAction(
  input: z.infer<typeof bulkInviteStudentsSchema>,
): Promise<
  ActionResult<{
    invited: Array<{
      id: string;
      classroomId: string;
      fullName: string;
      email: string;
      inviteStatus: string;
    }>;
    failed: Array<{
      fullName: string;
      email: string;
      error: string;
    }>;
  }>
> {
  try {
    const body = bulkInviteStudentsSchema.parse(input);
    const { session } = await requireTeachingSession();
    const classroomAccess = await ensureClassroomOwnerAccess(
      session.user.id,
      body.classroomId,
    );

    const seenEmails = new Set<string>();
    const invited: Array<{
      id: string;
      classroomId: string;
      fullName: string;
      email: string;
      inviteStatus: string;
    }> = [];
    const failed: Array<{
      fullName: string;
      email: string;
      error: string;
    }> = [];

    for (const student of body.students) {
      const normalizedEmail = student.email.trim().toLowerCase();
      if (seenEmails.has(normalizedEmail)) {
        failed.push({
          fullName: student.fullName.trim(),
          email: normalizedEmail,
          error: "Duplicate email in this import batch.",
        });
        continue;
      }

      seenEmails.add(normalizedEmail);

      try {
        const invitedStudent = await inviteManagedStudentToClassroom({
          classroomAccess,
          invitedByUserId: session.user.id,
          fullName: student.fullName,
          email: student.email,
        });
        invited.push(invitedStudent);
      } catch (error) {
        failed.push({
          fullName: student.fullName.trim(),
          email: normalizedEmail,
          error: error instanceof Error ? error.message : "Failed to invite student.",
        });
      }
    }

    return {
      success: true,
      data: {
        invited,
        failed,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to import classroom roster",
    };
  }
}

export async function createLearningTopicAction(
  input: z.infer<typeof createLearningTopicSchema>,
): Promise<
  ActionResult<{
    id: string;
    classroomId: string;
    title: string;
    learningOutcomeCount: number;
    contentLocale: AppLocale;
  }>
> {
  try {
    const body = createLearningTopicSchema.parse(input);
    const { session } = await requireTeachingSession();

    const classroomAccess = await getTeacherClassroomAccess(
      session.user.id,
      body.classroomId,
    );

    if (!classroomAccess) {
      return { success: false, error: "Classroom not found" };
    }

    const topicId = nanoid();
    const workspaceSettings = classroomAccess.organizationId
      ? await getWorkspaceLocaleSettings(classroomAccess.organizationId)
      : null;
    if (
      body.contentLocale &&
      workspaceSettings &&
      !workspaceSettings.allowedLocales.includes(body.contentLocale)
    ) {
      return {
        success: false,
        error: "That language is not enabled for the active workspace.",
      };
    }
    const contentLocale = await resolveUiLocaleForContentCreation({
      explicitLocale: body.contentLocale ?? null,
      session,
      workspaceId: classroomAccess.organizationId ?? undefined,
    });
    const learningOutcomes = body.learningOutcomes.map((outcome, index) =>
      learningOutcomeDefinitionSchema.parse({
        id: outcome.id?.trim() || `outcome-${index + 1}`,
        title: outcome.title.trim(),
        description: outcome.description.trim(),
        evidenceSignals: outcome.evidenceSignals ?? [],
        masteryThreshold: outcome.masteryThreshold ?? 70,
      }),
    );

    const sourceBoundary = topicSourceBoundarySchema.parse({
      ...body.sourceBoundary,
      teacherSummary: body.sourceBoundary?.teacherSummary ?? body.description ?? "",
    });
    const subjectInfo = deriveSubjectInfo({
      subjectKey: body.subjectKey,
      subjectLabel: body.subjectLabel,
      subject: body.subject ?? classroomAccess.subject,
    });

    await getDb().insert(learningTopics).values({
      id: topicId,
      classroomId: classroomAccess.id,
      createdByUserId: session.user.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      subject: subjectInfo.subjectLabel,
      contentLocale,
      subjectKey: subjectInfo.subjectKey,
      subjectLabel: subjectInfo.subjectLabel,
      status: "draft",
      openingPreference: "auto",
      sourceBoundary,
      learningOutcomes,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      success: true,
      data: {
        id: topicId,
        classroomId: classroomAccess.id,
        title: body.title.trim(),
        learningOutcomeCount: learningOutcomes.length,
        contentLocale,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create learning topic",
    };
  }
}

export async function getTeacherClassroomsAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      description: string | null;
      subject: string | null;
      defaultContentLocale: AppLocale;
      gradeBand: string;
      gradeLabel: string;
      status: string;
      teacherUserId: string;
      teacherName: string;
      accessLevel: "owner" | "collaborator" | "none";
      accessRequestStatus: string | null;
      departmentId: string | null;
      departmentName: string | null;
      studentCount: number;
      topicCount: number;
    }>
  >
> {
  try {
    const { session, organizationId } = await requireTeachingSession();
    const data = organizationId
      ? await getWorkspaceClassroomDirectory(session.user.id, organizationId)
      : await getPersonalClassroomDirectory(session.user.id);

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load classrooms",
    };
  }
}

export async function requestClassroomAccessAction(
  input: z.infer<typeof classroomAccessRequestSchema>,
): Promise<ActionResult<{ requestId: string; status: "pending" }>> {
  try {
    const body = classroomAccessRequestSchema.parse(input);
    const { session, organizationId } = await requireWorkspaceContext();

    const classroom = await getDb().query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, body.classroomId),
        eq(classrooms.organizationId, organizationId),
      ),
    });

    if (!classroom) {
      return { success: false, error: "Classroom not found" };
    }

    const existingAccess = await getTeacherClassroomAccess(
      session.user.id,
      body.classroomId,
    );
    if (existingAccess) {
      return {
        success: false,
        error: "You already have access to this classroom.",
      };
    }

    const existingPending = await getDb().query.classroomAccessRequests.findFirst({
      where: and(
        eq(classroomAccessRequests.classroomId, body.classroomId),
        eq(classroomAccessRequests.requesterUserId, session.user.id),
        eq(classroomAccessRequests.status, "pending"),
      ),
    });

    if (existingPending) {
      return {
        success: false,
        error: "You already have a pending access request for this classroom.",
      };
    }

    const requestId = nanoid();
    await getDb().insert(classroomAccessRequests).values({
      id: requestId,
      classroomId: body.classroomId,
      requesterUserId: session.user.id,
      status: "pending",
      message: body.message?.trim() || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      success: true,
      data: {
        requestId,
        status: "pending",
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to request classroom access",
    };
  }
}

export async function getClassroomAccessRequestsAction(
  classroomId: string,
): Promise<
  ActionResult<
    Array<{
      id: string;
      status: string;
      message: string | null;
      createdAt: Date;
      requester: {
        id: string;
        name: string;
        email: string;
      };
    }>
  >
> {
  try {
    const { session } = await requireWorkspaceContext();
    const classroomAccess = await getTeacherClassroomAccess(session.user.id, classroomId);

    if (!classroomAccess || classroomAccess.accessLevel !== "owner") {
      return { success: false, error: "Only the classroom owner can review access requests." };
    }

    const requests = await getDb().query.classroomAccessRequests.findMany({
      where: and(
        eq(classroomAccessRequests.classroomId, classroomId),
        eq(classroomAccessRequests.status, "pending"),
      ),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      with: {
        requester: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      data: requests.map((request) => ({
        id: request.id,
        status: request.status,
        message: request.message,
        createdAt: request.createdAt,
        requester: {
          id: request.requester.id,
          name: request.requester.name,
          email: request.requester.email,
        },
      })),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load access requests",
    };
  }
}

export async function getClassroomCollaboratorsAction(
  classroomId: string,
): Promise<
  ActionResult<
    Array<{
      id: string;
      teacherUserId: string;
      accessLevel: "owner" | "collaborator";
      name: string;
      email: string;
      grantedAt: Date;
    }>
  >
> {
  try {
    const { session } = await requireWorkspaceContext();
    const classroomAccess = await getTeacherClassroomAccess(session.user.id, classroomId);

    if (!classroomAccess) {
      return { success: false, error: "Classroom not found" };
    }

    const collaborators = await getDb().query.classroomTeacherAccess.findMany({
      where: eq(classroomTeacherAccess.classroomId, classroomId),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
      with: {
        teacher: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      data: collaborators.flatMap((record) =>
        record.accessLevel === "owner" || record.accessLevel === "collaborator"
          ? [
              {
                id: record.id,
                teacherUserId: record.teacherUserId,
                accessLevel: record.accessLevel,
                name: record.teacher.name || record.teacher.email,
                email: record.teacher.email,
                grantedAt: record.createdAt,
              },
            ]
          : [],
      ),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load collaborators",
    };
  }
}

export async function grantClassroomCollaboratorAccessAction(
  input: z.infer<typeof classroomCollaboratorInviteSchema>,
): Promise<
  ActionResult<{
    id: string;
    teacherUserId: string;
    accessLevel: "collaborator";
    name: string;
    email: string;
    grantedAt: Date;
  }>
> {
  try {
    const body = classroomCollaboratorInviteSchema.parse(input);
    const { session, organizationId } = await requireWorkspaceContext();
    const classroomAccess = await ensureClassroomOwnerAccess(
      session.user.id,
      body.classroomId,
    );
    const normalizedEmail = body.email.trim().toLowerCase();

    const invitedMember = await getDb()
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(
        and(
          eq(members.organizationId, organizationId),
          sql`lower(${users.email}) = ${normalizedEmail}`,
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!invitedMember) {
      return {
        success: false,
        error: "That teacher must join the workspace before you can grant classroom access.",
      };
    }

    if (invitedMember.userId === classroomAccess.teacherUserId) {
      return {
        success: false,
        error: "The classroom owner already has access.",
      };
    }

    const existingAccess = await getDb().query.classroomTeacherAccess.findFirst({
      where: and(
        eq(classroomTeacherAccess.classroomId, body.classroomId),
        eq(classroomTeacherAccess.teacherUserId, invitedMember.userId),
      ),
    });

    if (existingAccess) {
      return {
        success: false,
        error: "That teacher already has classroom access.",
      };
    }

    const collaboratorId = nanoid();
    const grantedAt = new Date();

    await getDb().transaction(async (tx) => {
      await tx.insert(classroomTeacherAccess).values({
        id: collaboratorId,
        classroomId: body.classroomId,
        teacherUserId: invitedMember.userId,
        grantedByUserId: session.user.id,
        accessLevel: "collaborator",
        createdAt: grantedAt,
        updatedAt: grantedAt,
      });

      await tx
        .update(classroomAccessRequests)
        .set({
          status: "approved",
          resolvedByUserId: session.user.id,
          resolvedAt: grantedAt,
          updatedAt: grantedAt,
        })
        .where(
          and(
            eq(classroomAccessRequests.classroomId, body.classroomId),
            eq(classroomAccessRequests.requesterUserId, invitedMember.userId),
            eq(classroomAccessRequests.status, "pending"),
          ),
        );
    });

    return {
      success: true,
      data: {
        id: collaboratorId,
        teacherUserId: invitedMember.userId,
        accessLevel: "collaborator",
        name: invitedMember.name || invitedMember.email,
        email: invitedMember.email,
        grantedAt,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to grant collaborator access",
    };
  }
}

export async function respondToClassroomAccessRequestAction(
  input: z.infer<typeof classroomAccessDecisionSchema>,
): Promise<ActionResult<{ requestId: string; status: "approved" | "rejected" }>> {
  try {
    const body = classroomAccessDecisionSchema.parse(input);
    const { session } = await requireWorkspaceContext();
    const classroomAccess = await getTeacherClassroomAccess(
      session.user.id,
      body.classroomId,
    );

    if (!classroomAccess || classroomAccess.accessLevel !== "owner") {
      return { success: false, error: "Only the classroom owner can review access requests." };
    }

    const request = await getDb().query.classroomAccessRequests.findFirst({
      where: and(
        eq(classroomAccessRequests.id, body.requestId),
        eq(classroomAccessRequests.classroomId, body.classroomId),
        eq(classroomAccessRequests.status, "pending"),
      ),
    });

    if (!request) {
      return { success: false, error: "Access request not found." };
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(classroomAccessRequests)
        .set({
          status: body.decision,
          resolvedByUserId: session.user.id,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(classroomAccessRequests.id, request.id));

      if (body.decision === "approved") {
        await tx.insert(classroomTeacherAccess).values({
          id: nanoid(),
          classroomId: body.classroomId,
          teacherUserId: request.requesterUserId,
          grantedByUserId: session.user.id,
          accessLevel: "collaborator",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    return {
      success: true,
      data: {
        requestId: request.id,
        status: body.decision,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to review classroom access request",
    };
  }
}

export async function revokeClassroomCollaboratorAccessAction(
  input: z.infer<typeof classroomCollaboratorRevocationSchema>,
): Promise<ActionResult<{ teacherUserId: string }>> {
  try {
    const body = classroomCollaboratorRevocationSchema.parse(input);
    const { session } = await requireWorkspaceContext();
    const classroomAccess = await getTeacherClassroomAccess(
      session.user.id,
      body.classroomId,
    );

    if (!classroomAccess || classroomAccess.accessLevel !== "owner") {
      return {
        success: false,
        error: "Only the classroom owner can remove collaborators.",
      };
    }

    const collaborator = await getDb().query.classroomTeacherAccess.findFirst({
      where: and(
        eq(classroomTeacherAccess.classroomId, body.classroomId),
        eq(classroomTeacherAccess.teacherUserId, body.teacherUserId),
      ),
    });

    if (!collaborator) {
      return { success: false, error: "Collaborator not found." };
    }

    if (collaborator.accessLevel !== "collaborator") {
      return {
        success: false,
        error: "Only collaborator access can be revoked from this screen.",
      };
    }

    await getDb()
      .delete(classroomTeacherAccess)
      .where(eq(classroomTeacherAccess.id, collaborator.id));

    return {
      success: true,
      data: {
        teacherUserId: body.teacherUserId,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to revoke collaborator access",
    };
  }
}

export async function getClassroomAssignedSurveyProgressAction(
  classroomId: string,
): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      status: string;
      shareableLink: string | null;
      createdAt: string | null;
      assignedCount: number;
      completedCount: number;
      inProgressCount: number;
      notStartedCount: number;
      completionRate: number;
      students: Array<{
        classroomStudentId: string;
        fullName: string;
        email: string;
        inviteStatus: string;
        onboardingStatus: string;
        responseStatus: "not_started" | "in_progress" | "completed";
        completedAt: string | null;
      }>;
    }>
  >
> {
  try {
    const { session } = await requireTeachingSession();
    const classroomAccess = await getTeacherClassroomAccess(session.user.id, classroomId);

    if (!classroomAccess) {
      return { success: false, error: "Classroom not found" };
    }

    const [roster, classroomSurveys] = await Promise.all([
      getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.classroomId, classroomId),
        orderBy: (table, { asc }) => [asc(table.fullName)],
      }),
      getDb().query.surveys.findMany({
        where: and(
          eq(surveys.classroomId, classroomId),
          eq(surveys.deliveryMode, "classroom_assigned"),
          eq(surveys.status, "active"),
          sql`${surveys.shareableLink} is not null`,
        ),
        orderBy: (table, { desc }) => [desc(table.updatedAt)],
      }),
    ]);

    if (!roster.length || !classroomSurveys.length) {
      return {
        success: true,
        data: classroomSurveys.map((survey) => ({
          id: survey.id,
          title: survey.title,
          status: survey.status,
          shareableLink: survey.shareableLink ?? null,
          createdAt: survey.createdAt?.toISOString() ?? null,
          assignedCount: roster.length,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: roster.length,
          completionRate: 0,
          students: roster.map((student) => ({
            classroomStudentId: student.id,
            fullName: student.fullName,
            email: student.email,
            inviteStatus: student.inviteStatus,
            onboardingStatus: student.onboardingStatus,
            responseStatus: "not_started" as const,
            completedAt: null,
          })),
        })),
      };
    }

    const surveyIds = classroomSurveys.map((survey) => survey.id);
    const studentIds = roster.map((student) => student.id);
    const conversations = await getDb().query.surveyConversations.findMany({
      where: and(
        inArray(surveyConversations.surveyId, surveyIds),
        inArray(surveyConversations.participantId, studentIds),
      ),
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
    });

    const latestConversationByKey = conversations.reduce<
      Map<string, (typeof conversations)[number]>
    >((entries, conversation) => {
      const participantId = conversation.participantId;
      if (!participantId) {
        return entries;
      }

      const key = `${conversation.surveyId}:${participantId}`;
      if (!entries.has(key)) {
        entries.set(key, conversation);
      }
      return entries;
    }, new Map());

    return {
      success: true,
      data: classroomSurveys.map((survey) => {
        const studentStates = roster.map((student) => {
          const conversation = latestConversationByKey.get(`${survey.id}:${student.id}`);
          const responseStatus: "completed" | "in_progress" | "not_started" =
            conversation?.completed
              ? "completed"
              : conversation
                ? "in_progress"
                : "not_started";

          return {
            classroomStudentId: student.id,
            fullName: student.fullName,
            email: student.email,
            inviteStatus: student.inviteStatus,
            onboardingStatus: student.onboardingStatus,
            responseStatus,
            completedAt:
              responseStatus === "completed"
                ? conversation?.updatedAt?.toISOString() ?? null
                : null,
          };
        });

        const completedCount = studentStates.filter(
          (student) => student.responseStatus === "completed",
        ).length;
        const inProgressCount = studentStates.filter(
          (student) => student.responseStatus === "in_progress",
        ).length;
        const assignedCount = studentStates.length;
        const notStartedCount = assignedCount - completedCount - inProgressCount;

        return {
          id: survey.id,
          title: survey.title,
          status: survey.status,
          shareableLink: survey.shareableLink ?? null,
          createdAt: survey.createdAt?.toISOString() ?? null,
          assignedCount,
          completedCount,
          inProgressCount,
          notStartedCount,
          completionRate:
            assignedCount > 0
              ? Math.round((completedCount / assignedCount) * 100)
              : 0,
          students: studentStates,
        };
      }),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load assigned survey progress",
    };
  }
}

export async function getLearningInterventionsAction(input: {
  classroomId: string;
  topicId?: string;
  classroomStudentId?: string;
}): Promise<ActionResult<LearningInterventionRecord[]>> {
  try {
    const { session } = await requireTeachingSession();
    const classroomAccess = await getTeacherClassroomAccess(session.user.id, input.classroomId);

    if (!classroomAccess) {
      return { success: false, error: "Classroom not found" };
    }

    const interventions = await getDb().query.learningInterventions.findMany({
      where: (table, operators) => {
        const conditions = [operators.eq(table.classroomId, input.classroomId)];

        if (input.topicId) {
          conditions.push(operators.eq(table.topicId, input.topicId));
        }

        if (input.classroomStudentId) {
          conditions.push(
            operators.eq(table.classroomStudentId, input.classroomStudentId),
          );
        }

        return operators.and(...conditions);
      },
      orderBy: (table, operators) => [operators.desc(table.updatedAt)],
      with: {
        classroomStudent: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      data: interventions.map((intervention) => formatLearningIntervention(intervention)),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load interventions",
    };
  }
}

export async function createLearningInterventionAction(
  input: unknown,
): Promise<ActionResult<LearningInterventionRecord>> {
  try {
    const body = learningInterventionSchema.parse(input);
    const { session } = await requireTeachingSession();
    const classroomAccess = await getTeacherClassroomAccess(
      session.user.id,
      body.classroomId,
    );

    if (!classroomAccess) {
      return { success: false, error: "Classroom not found" };
    }

    const classroomStudent = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.id, body.classroomStudentId),
        eq(classroomStudents.classroomId, body.classroomId),
      ),
    });

    if (!classroomStudent) {
      return { success: false, error: "Student not found in this classroom." };
    }

    if (body.topicId) {
      const topic = await getDb().query.learningTopics.findFirst({
        where: and(
          eq(learningTopics.id, body.topicId),
          eq(learningTopics.classroomId, body.classroomId),
        ),
      });

      if (!topic) {
        return { success: false, error: "Topic not found in this classroom." };
      }
    }

    const interventionId = nanoid();
    const now = new Date();
    const dueAt =
      body.dueAt && body.dueAt.trim().length > 0 ? new Date(body.dueAt) : null;

    await getDb().insert(learningInterventions).values({
      id: interventionId,
      organizationId: classroomAccess.organizationId,
      classroomId: body.classroomId,
      topicId: body.topicId?.trim() || null,
      classroomStudentId: body.classroomStudentId,
      createdByUserId: session.user.id,
      interventionType: body.interventionType,
      status: "planned",
      priority: body.priority,
      title: body.title.trim(),
      notes: body.notes?.trim() || null,
      dueAt,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const createdIntervention = await getDb().query.learningInterventions.findFirst({
      where: eq(learningInterventions.id, interventionId),
      with: {
        classroomStudent: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!createdIntervention) {
      return { success: false, error: "Failed to load created intervention." };
    }

    return {
      success: true,
      data: formatLearningIntervention(createdIntervention),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create intervention",
    };
  }
}

export async function updateLearningInterventionAction(
  input: unknown,
): Promise<ActionResult<LearningInterventionRecord>> {
  try {
    const body = learningInterventionUpdateSchema.parse(input);
    const { session } = await requireTeachingSession();
    const intervention = await getDb().query.learningInterventions.findFirst({
      where: eq(learningInterventions.id, body.interventionId),
      with: {
        classroomStudent: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!intervention) {
      return { success: false, error: "Intervention not found." };
    }

    const classroomAccess = await getTeacherClassroomAccess(
      session.user.id,
      intervention.classroomId,
    );

    if (!classroomAccess) {
      return { success: false, error: "Unauthorized" };
    }

    const dueAt =
      body.dueAt && body.dueAt.trim().length > 0 ? new Date(body.dueAt) : null;
    const completedAt = body.status === "completed" ? new Date() : null;

    await getDb()
      .update(learningInterventions)
      .set({
        status: body.status,
        notes: body.notes?.trim() || intervention.notes,
        dueAt,
        completedAt,
        updatedAt: new Date(),
      })
      .where(eq(learningInterventions.id, body.interventionId));

    const updatedIntervention = await getDb().query.learningInterventions.findFirst({
      where: eq(learningInterventions.id, body.interventionId),
      with: {
        classroomStudent: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!updatedIntervention) {
      return { success: false, error: "Failed to load updated intervention." };
    }

    return {
      success: true,
      data: formatLearningIntervention(updatedIntervention),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update intervention",
    };
  }
}


