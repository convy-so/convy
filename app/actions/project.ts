"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";

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
      // Check if user is member
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
      // Get all projects in workspace
      // Access check: User must be member
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
      // Get personal projects
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

    // Authorization:
    // If personal, must be owner.
    // If workspace, must be member? Or owner?
    // Let's allow any member to update project details for now (collaborative)
    // Or maybe just owner/creator?
    // "members... must be able to see...".
    // Let's restrict update to creator or workspace admin if we had admins.
    // Since roles are basic (owner/member), maybe workspace owner or project creator.
    
    let isAuthorized = false;

    if (project.organizationId) {
      const isMember = await isWorkspaceMember(session.user.id, project.organizationId);
      if (isMember) {
         // Allow any member to edit project metadata? 
         // For now, let's allow it to facilitate collaboration.
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
        // Only workspace owner or project creator can delete
        // We need to check if session user is workspace owner
        // Importing isWorkspaceOwner creates circular dep? No.
        // But verifying logic: 
        if (project.userId === session.user.id) {
            // CRITICAL: Even if creator, must still be a member of the workspace
            const { isWorkspaceMember } = await import("@/lib/workspace-access");
            const isMember = await isWorkspaceMember(session.user.id, project.organizationId);
            if (isMember) {
                isAuthorized = true;
            }
        } else {
             // Check if workspace owner
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
    
    // Check if project has surveys?
    // If cascade delete, surveys get deleted. 
    // We should probably prevent deletion if surveys exist, or move them to root (set projectId null).
    // Let's move surveys to root instead of deleting them.
    
    await db.update(surveys)
      .set({ projectId: null })
      .where(eq(surveys.projectId, id));

    await db.delete(projects).where(eq(projects.id, id));

    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: "Failed to delete project" };
  }
}
