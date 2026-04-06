"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq, and, isNull, count, sum, getTableColumns } from "drizzle-orm";

import { getDb } from "@/db";
import { projects, surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionContext,
  hasSurveyPermission,
  isWorkspaceMember,
  isWorkspaceOwner,
} from "@/lib/workspace-access";
import { invalidateDashboardCaches } from "@/lib/cache";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const createProjectSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

type ProjectListRow = typeof projects.$inferSelect & {
  surveyCount: number;
  totalResponses: number;
};

type ProjectSurveySummary = typeof surveys.$inferSelect & {
  summary: string | null;
  completedCount: number;
};

type ProjectPermissions = {
  canEditMetadata: boolean;
  canOrganizeSurveys: boolean;
  canDelete: boolean;
  isSharedWorkspaceProject: boolean;
};

type ProjectListItem = ProjectListRow & ProjectPermissions;
type ProjectDetail = typeof projects.$inferSelect &
  ProjectPermissions & {
    surveys: ProjectSurveySummary[];
  };

async function getProjectPermissions(
  project: typeof projects.$inferSelect,
  userId: string,
): Promise<ProjectPermissions> {
  if (!project.organizationId) {
    const isOwner = project.userId === userId;
    return {
      canEditMetadata: isOwner,
      canOrganizeSurveys: isOwner,
      canDelete: isOwner,
      isSharedWorkspaceProject: false,
    };
  }

  const [member, owner] = await Promise.all([
    isWorkspaceMember(userId, project.organizationId),
    isWorkspaceOwner(userId, project.organizationId),
  ]);
  const isProjectOwner = project.userId === userId;

  return {
    canEditMetadata: isProjectOwner || owner,
    canOrganizeSurveys: member,
    canDelete: isProjectOwner || owner,
    isSharedWorkspaceProject: member && !isProjectOwner,
  };
}

export async function createProjectAction(
  input: z.infer<typeof createProjectSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = createProjectSchema.parse(input);
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      // Check if user is member
      const isMember = await isWorkspaceMember(session.user.id, activeOrgId);
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }
    }

    const projectId = nanoid();

    await getDb().transaction(async (tx) => {
      await tx.insert(projects).values({
        id: projectId,
        userId: session.user.id,
        organizationId: activeOrgId,
        name: body.name,
        description: body.description,
        color: body.color,
        icon: body.icon,
      });

      if (activeOrgId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: activeOrgId,
          eventType: "workspace.project_created",
          actorId: session.user.id,
          payload: {
            workspaceId: activeOrgId,
            project: {
              id: projectId,
              name: body.name,
              description: body.description ?? null,
              color: body.color ?? null,
              icon: body.icon ?? null,
              userId: session.user.id,
            },
          },
        });
      }
    });

    await invalidateDashboardCaches(session.user.id, activeOrgId, [
      "stats",
      "recentSurveys",
    ]);



    return { success: true, data: { id: projectId } };
  } catch (error) {
    console.error("[createProjectAction] Failed:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create project" };
  }
}

export async function getProjectsAction(): Promise<
  ActionResult<ProjectListItem[]>
> {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isMember = await isWorkspaceMember(session.user.id, activeOrgId);
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }

      const projectList = await getDb()
        .select({
          ...getTableColumns(projects),
          surveyCount: count(surveys.id),
          totalResponses: sum(surveys.currentParticipants),
        })
        .from(projects)
        .leftJoin(surveys, eq(projects.id, surveys.projectId))
        .where(
          and(
            eq(projects.organizationId, activeOrgId),
          ),
        )
        .groupBy(projects.id)
        .orderBy(projects.createdAt);

      const results = await Promise.all(
        projectList.map(async (project) => ({
          ...project,
          surveyCount: Number(project.surveyCount),
          totalResponses: Number(project.totalResponses || 0),
          ...(await getProjectPermissions(project, session.user.id)),
        })),
      );

      return { success: true, data: results };
    } else {
      const projectList = await getDb()
        .select({
          ...getTableColumns(projects),
          surveyCount: count(surveys.id),
          totalResponses: sum(surveys.currentParticipants),
        })
        .from(projects)
        .leftJoin(surveys, eq(projects.id, surveys.projectId))
        .where(
          and(
            eq(projects.userId, session.user.id),
            isNull(projects.organizationId),
          ),
        )
        .groupBy(projects.id)
        .orderBy(projects.createdAt);

      const results = await Promise.all(
        projectList.map(async (project) => ({
          ...project,
          surveyCount: Number(project.surveyCount),
          totalResponses: Number(project.totalResponses || 0),
          ...(await getProjectPermissions(project, session.user.id)),
        })),
      );

      return { success: true, data: results };
    }
  } catch (error) {
    console.error("Error fetching projects:", error);
    return { success: false, error: "Failed to fetch projects" };
  }
}

export async function getProjectAction(id: string): Promise<ActionResult<ProjectDetail>> {
  try {
    const session = await getVerifiedSession();

    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        project.organizationId,
      );
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }
    } else if (project.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const projectSurveys = await getDb()
      .select({
        ...getTableColumns(surveys),
        completedCount: count(surveyConversations.id),
      })
      .from(surveys)
      .leftJoin(
        surveyConversations,
        and(
          eq(surveyConversations.surveyId, surveys.id),
          eq(surveyConversations.completed, true),
        ),
      )
      .where(eq(surveys.projectId, id))
      .groupBy(surveys.id);

    // We add a summary field to match the frontend expectations if needed,
    // or just return the surveys as is. The frontend type expectations
    // might need to be adjusted or mapped.
    // For now, returning surveys directly.

    return {
      success: true,
      data: {
        ...project,
        ...(await getProjectPermissions(project, session.user.id)),
        surveys: projectSurveys.map((s) => ({
          ...s,
          summary: null, // Placeholder if needed, or derived from analytics
          completedCount: Number(s.completedCount),
        })),
      },
    };
  } catch (error) {
    console.error("Error fetching project:", error);
    return { success: false, error: "Failed to fetch project" };
  }
}

export async function addSurveyToProjectAction(
  projectId: string,
  surveyId: string,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    // 1. Verify project access
    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        project.organizationId,
      );
      if (!isMember) {
        return { success: false, error: "Unauthorized access to project" };
      }
    } else if (project.userId !== session.user.id) {
      return { success: false, error: "Unauthorized access to project" };
    }

    // 2. Verify survey access
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    // Check if survey belongs to same org/user context
    if (project.organizationId) {
      if (survey.organizationId !== project.organizationId) {
        return {
          success: false,
          error: "Survey belongs to a different workspace",
        };
      }

      const permission = await getSurveyPermissionContext(
        session.user.id,
        survey.id,
        { activeWorkspaceId: project.organizationId },
      );
      if (!hasSurveyPermission(permission, "canEdit")) {
        return {
          success: false,
          error: "You need edit access to organize this survey",
        };
      }
    } else {
      if (survey.userId !== session.user.id || survey.organizationId) {
        return { success: false, error: "Unauthorized access to survey" };
      }
    }

    // 3. Update survey
    await getDb()
      .update(surveys)
      .set({ projectId: projectId })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, project.organizationId, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error adding survey to project:", error);
    return { success: false, error: "Failed to add survey to project" };
  }
}

export async function removeSurveyFromProjectAction(
  projectId: string,
  surveyId: string,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    // 1. Verify project access (mostly to ensure user has right to modify this project content)
    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      // Even if project doesn't exist, if we are just removing the link from survey,
      // we mainly need to check survey access. But for consistency, let's enforce project existence verification
      // or just verify survey access is enough?
      // Let's stick to verifying project access to be safe.
      return { success: false, error: "Project not found" };
    }

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        project.organizationId,
      );
      if (!isMember) {
        return { success: false, error: "Unauthorized access to project" };
      }
    } else if (project.userId !== session.user.id) {
      return { success: false, error: "Unauthorized access to project" };
    }

    // 2. Verify survey is indeed in this project
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(and(eq(surveys.id, surveyId), eq(surveys.projectId, projectId)));

    if (!survey) {
      // Survey not in this project or doesn't exist
      return { success: false, error: "Survey not found in this project" };
    }

    if (project.organizationId) {
      const permission = await getSurveyPermissionContext(
        session.user.id,
        survey.id,
        { activeWorkspaceId: project.organizationId },
      );
      if (!hasSurveyPermission(permission, "canEdit")) {
        return {
          success: false,
          error: "You need edit access to reorganize this survey",
        };
      }
    }

    // 3. Update survey
    await getDb()
      .update(surveys)
      .set({ projectId: null })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, project.organizationId, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error removing survey from project:", error);
    return { success: false, error: "Failed to remove survey from project" };
  }
}

const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export async function updateProjectAction(
  input: z.infer<typeof updateProjectSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateProjectSchema.parse(input);

    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, body.id));

    if (!project) {
      return { success: false, error: "Project not found" };
    }
    if (project.organizationId) {
      const canEditMetadata = await isWorkspaceOwner(
        session.user.id,
        project.organizationId,
      );
      if (!canEditMetadata && project.userId !== session.user.id) {
        return { success: false, error: "Unauthorized" };
      }
    } else if (project.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const updateData: Partial<typeof projects.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.icon !== undefined) updateData.icon = body.icon;

    await getDb().transaction(async (tx) => {
      await tx
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, body.id));

      if (project.organizationId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: project.organizationId,
          eventType: "workspace.project_updated",
          actorId: session.user.id,
          payload: {
            workspaceId: project.organizationId,
            project: {
              id: body.id,
              ...updateData,
            },
          },
        });
      }
    });

    await invalidateDashboardCaches(session.user.id, project.organizationId, [
      "stats",
      "recentSurveys",
    ]);



    return { success: true, data: { id: body.id } };
  } catch (error) {
    console.error("[updateProjectAction] Failed:", error);
    return { success: false, error: "Failed to update project" };
  }
}

export async function deleteProjectAction(
  id: string,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    if (project.organizationId) {
      const canDelete = await isWorkspaceOwner(
        session.user.id,
        project.organizationId,
      );
      if (!canDelete && project.userId !== session.user.id) {
        return { success: false, error: "Unauthorized" };
      }
    } else if (project.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(surveys)
        .set({ projectId: null })
        .where(eq(surveys.projectId, id));

      await tx.delete(projects).where(eq(projects.id, id));

      if (project.organizationId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: project.organizationId,
          eventType: "workspace.project_deleted",
          actorId: session.user.id,
          payload: {
            workspaceId: project.organizationId,
            projectId: id,
          },
        });
      }
    });

    await invalidateDashboardCaches(session.user.id, project.organizationId, [
      "stats",
      "recentSurveys",
    ]);



    return { success: true, data: undefined };
  } catch (error) {
    console.error("[deleteProjectAction] Failed:", error);
    return { success: false, error: "Failed to delete project" };
  }
}

export async function transferProjectOwnershipAction(input: {
  projectId: string;
  newOwnerUserId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId));

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    if (!project.organizationId) {
      return {
        success: false,
        error: "Project ownership transfer is only supported in workspaces",
      };
    }

    const isMember = await isWorkspaceMember(
      input.newOwnerUserId,
      project.organizationId,
    );
    if (!isMember) {
      return {
        success: false,
        error: "New owner must be a member of the workspace",
      };
    }

    if (project.userId !== session.user.id) {
      const { isWorkspaceOwner } = await import("@/lib/workspace-access");
      const isOwner = await isWorkspaceOwner(
        session.user.id,
        project.organizationId,
      );
      if (!isOwner) {
        return { success: false, error: "Unauthorized" };
      }
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(projects)
        .set({ userId: input.newOwnerUserId, updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));

      await recordRealtimeEvent(tx, {
        scope: "workspace",
        workspaceId: project.organizationId,
        eventType: "workspace.project_updated",
        actorId: session.user.id,
        payload: {
          workspaceId: project.organizationId,
          project: {
            id: project.id,
            userId: input.newOwnerUserId,
          },
        },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error transferring project ownership:", error);
    return { success: false, error: "Failed to transfer project ownership" };
  }
}
