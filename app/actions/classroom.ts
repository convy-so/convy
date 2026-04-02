"use server";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import {
  classroomAccessRequests,
  classroomStudents,
  classrooms,
  classroomTeacherAccess,
  departments,
  learningTopics,
  users,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
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

async function requireActiveWorkspace() {
  const session = await getVerifiedSession();
  const organizationId = session.session.activeOrganizationId;

  if (!organizationId) {
    throw new Error("Please select a workspace before using classrooms.");
  }

  const canAccess = await isWorkspaceMember(session.user.id, organizationId);
  if (!canAccess) {
    throw new Error("Unauthorized");
  }

  return { session, organizationId };
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
    const { session, organizationId } = await requireActiveWorkspace();
    const classroomId = nanoid();
    const accessId = nanoid();
    const now = new Date();
    const gradeBand = normalizeGradeBand(body.gradeLabel);
    const departmentId = body.departmentId?.trim() || null;
    const defaultContentLocale = await resolveUiLocaleForContentCreation({
      explicitLocale: body.defaultContentLocale ?? null,
      session,
      workspaceId: organizationId,
    });
    const workspaceSettings = await getWorkspaceLocaleSettings(organizationId);
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

    if (departmentId) {
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
    const { session } = await requireActiveWorkspace();

    const classroomAccess = await getTeacherClassroomAccess(
      session.user.id,
      body.classroomId,
    );

    if (!classroomAccess) {
      return { success: false, error: "Classroom not found" };
    }

    if (classroomAccess.accessLevel !== "owner") {
      return {
        success: false,
        error: "Only the classroom owner can invite students.",
      };
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    const existingStudent = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, classroomAccess.id),
        eq(classroomStudents.email, normalizedEmail),
      ),
    });

    if (existingStudent) {
      return {
        success: false,
        error: "That student email is already attached to this classroom.",
      };
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
        return {
          success: false,
          error:
            "That email already belongs to an existing account and cannot be auto-managed as a student.",
        };
      }
    }

    const studentId = nanoid();
    await getDb().insert(classroomStudents).values({
      id: studentId,
      classroomId: classroomAccess.id,
      invitedByUserId: session.user.id,
      fullName: body.fullName.trim(),
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
      success: true,
      data: {
        id: studentId,
        classroomId: classroomAccess.id,
        fullName: body.fullName.trim(),
        email: provisioned.email,
        inviteStatus: "invited",
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
      error: error instanceof Error ? error.message : "Failed to invite student",
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
    const { session } = await requireActiveWorkspace();

    const classroomAccess = await getTeacherClassroomAccess(
      session.user.id,
      body.classroomId,
    );

    if (!classroomAccess) {
      return { success: false, error: "Classroom not found" };
    }

    const topicId = nanoid();
    const workspaceSettings = await getWorkspaceLocaleSettings(
      classroomAccess.organizationId,
    );
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
      workspaceId: classroomAccess.organizationId,
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
    const { session, organizationId } = await requireActiveWorkspace();
    const data = await getWorkspaceClassroomDirectory(
      session.user.id,
      organizationId,
    );

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
    const { session, organizationId } = await requireActiveWorkspace();

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
    const { session } = await requireActiveWorkspace();
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
    const { session } = await requireActiveWorkspace();
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

export async function respondToClassroomAccessRequestAction(
  input: z.infer<typeof classroomAccessDecisionSchema>,
): Promise<ActionResult<{ requestId: string; status: "approved" | "rejected" }>> {
  try {
    const body = classroomAccessDecisionSchema.parse(input);
    const { session } = await requireActiveWorkspace();
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
    const { session } = await requireActiveWorkspace();
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
