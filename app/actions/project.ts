"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq, and, isNull, count, sum, getTableColumns } from "drizzle-orm";

import { getDb } from "@/db";
import { projects, surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { isWorkspaceMember } from "@/lib/workspace-access";
import { cache, cacheKeys } from "@/lib/cache";
import {
  publishPendingOutboxEntries,
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

    // Invalidate dashboard cache
    await cache.delete(cacheKeys.dashboardStats(session.user.id, activeOrgId));
    await cache.delete(
      cacheKeys.dashboardRecentSurveys(session.user.id, activeOrgId),
    );

    if (activeOrgId) {
      await publishPendingOutboxEntries();
    }

    return { success: true, data: { id: projectId } };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create project" };
  }
}

export async function getProjectsAction(): Promise<
  ActionResult<
    Array<
      typeof projects.$inferSelect & {
        surveyCount: number;
        totalResponses: number;
      }
    >
  >
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
        .where(eq(projects.organizationId, activeOrgId))
        .groupBy(projects.id)
        .orderBy(projects.createdAt);

      const results = projectList.map((p) => ({
        ...p,
        surveyCount: Number(p.surveyCount),
        totalResponses: Number(p.totalResponses || 0),
      }));

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

      const results = projectList.map((p) => ({
        ...p,
        surveyCount: Number(p.surveyCount),
        totalResponses: Number(p.totalResponses || 0),
      }));

      return { success: true, data: results };
    }
  } catch (error) {
    console.error("Error fetching projects:", error);
    return { success: false, error: "Failed to fetch projects" };
  }
}

export async function getProjectAction(id: string): Promise<
  ActionResult<
    typeof projects.$inferSelect & {
      surveys: Array<
        typeof surveys.$inferSelect & {
          summary: string | null;
          completedCount: number;
        }
      >;
    }
  >
> {
  try {
    const session = await getVerifiedSession();

    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    let isAuthorized = false;

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        project.organizationId,
      );
      if (isMember) {
        isAuthorized = true;
      }
    } else {
      if (project.userId === session.user.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
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

    let isAuthorized = false;

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        project.organizationId,
      );
      if (isMember) {
        isAuthorized = true;
      }
    } else {
      if (project.userId === session.user.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
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

    // Invalidate dashboard cache
    await cache.delete(
      cacheKeys.dashboardStats(session.user.id, project.organizationId),
    );
    await cache.delete(
      cacheKeys.dashboardRecentSurveys(session.user.id, project.organizationId),
    );

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

    let isAuthorized = false;
    if (project.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        project.organizationId,
      );
      if (isMember) {
        isAuthorized = true;
      }
    } else {
      if (project.userId === session.user.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
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

    // 3. Update survey
    await getDb()
      .update(surveys)
      .set({ projectId: null })
      .where(eq(surveys.id, surveyId));

    // Invalidate dashboard cache
    await cache.delete(
      cacheKeys.dashboardStats(session.user.id, project.organizationId),
    );
    await cache.delete(
      cacheKeys.dashboardRecentSurveys(session.user.id, project.organizationId),
    );

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
    let isAuthorized = false;

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        project.organizationId,
      );
      if (isMember) {
        isAuthorized = true;
      }
    } else {
      if (project.userId === session.user.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
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

    // Invalidate dashboard cache
    await cache.delete(
      cacheKeys.dashboardStats(session.user.id, project.organizationId),
    );
    await cache.delete(
      cacheKeys.dashboardRecentSurveys(session.user.id, project.organizationId),
    );

    if (project.organizationId) {
      await publishPendingOutboxEntries();
    }

    return { success: true, data: { id: body.id } };
  } catch (error) {
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

    const isAuthorized = project.userId === session.user.id;

    if (!isAuthorized) {
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

    // Invalidate dashboard cache
    await cache.delete(
      cacheKeys.dashboardStats(session.user.id, project.organizationId),
    );
    await cache.delete(
      cacheKeys.dashboardRecentSurveys(session.user.id, project.organizationId),
    );

    if (project.organizationId) {
      await publishPendingOutboxEntries();
    }

    return { success: true, data: undefined };
  } catch (error) {
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
    await publishPendingOutboxEntries();

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error transferring project ownership:", error);
    return { success: false, error: "Failed to transfer project ownership" };
  }
}
