"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq, and, isNull, sql, or } from "drizzle-orm";

import { db } from "@/db";
import { projects, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { isWorkspaceMember } from "@/lib/workspace-access";

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
  input: z.infer<typeof createProjectSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = createProjectSchema.parse(input);
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isMember = await isWorkspaceMember(session.user.id, activeOrgId);
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }
    }

    const projectId = nanoid();

    await db.insert(projects).values({
      id: projectId,
      userId: session.user.id,
      organizationId: activeOrgId,
      name: body.name,
      description: body.description,
      color: body.color,
      icon: body.icon,
    });

    return { success: true, data: { id: projectId } };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create project" };
  }
}

export async function getProjectsAction(): Promise<
  ActionResult<Array<typeof projects.$inferSelect>>
> {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    let projectList;

    if (activeOrgId) {
      const isMember = await isWorkspaceMember(session.user.id, activeOrgId);
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }

      projectList = await db
        .select()
        .from(projects)
        .where(eq(projects.organizationId, activeOrgId))
        .orderBy(projects.createdAt);
    } else {
      projectList = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, session.user.id),
            isNull(projects.organizationId)
          )
        )
        .orderBy(projects.createdAt);
    }

    return { success: true, data: projectList };
  } catch (error) {
    return { success: false, error: "Failed to fetch projects" };
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
  input: z.infer<typeof updateProjectSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateProjectSchema.parse(input);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, body.id));

    if (!project) {
      return { success: false, error: "Project not found" };
    }
    
    let isAuthorized = false;

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(session.user.id, project.organizationId);
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
    if (body.description !== undefined) updateData.description = body.description;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.icon !== undefined) updateData.icon = body.icon;

    await db.update(projects).set(updateData).where(eq(projects.id, body.id));

    return { success: true, data: { id: body.id } };
  } catch (error) {
    return { success: false, error: "Failed to update project" };
  }
}

export async function deleteProjectAction(id: string): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    // Determine authorization for deletion
    let isAuthorized = false;

    if (project.organizationId) {
        if (project.userId === session.user.id) {
            const { isWorkspaceMember } = await import("@/lib/workspace-access");
            const isMember = await isWorkspaceMember(session.user.id, project.organizationId);
            if (isMember) {
                isAuthorized = true;
            }
        } else {
             const { isWorkspaceOwner } = await import("@/lib/workspace-access");
             isAuthorized = await isWorkspaceOwner(session.user.id, project.organizationId);
        }
    } else {
      // Personal project - just check ownership
      if (project.userId === session.user.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return { success: false, error: "Unauthorized" };
    }    
    await db.update(surveys)
      .set({ projectId: null })
      .where(eq(surveys.projectId, id));

    await db.delete(projects).where(eq(projects.id, id));

    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: "Failed to delete project" };
  }
}
