import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { members, projects, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getCurrentWorkspaceRevision } from "@/lib/collaboration-service";
import { isWorkspaceMember } from "@/lib/workspace-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { workspaceId } = await params;

    if (!(await isWorkspaceMember(session.user.id, workspaceId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const db = getDb();
    const [workspaceMembers, workspaceProjects, workspaceSurveys, revision] =
      await Promise.all([
        db
          .select({
            id: members.id,
            userId: members.userId,
            role: members.role,
          })
          .from(members)
          .where(eq(members.organizationId, workspaceId)),
        db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            userId: projects.userId,
            color: projects.color,
            icon: projects.icon,
            createdAt: projects.createdAt,
            updatedAt: projects.updatedAt,
          })
          .from(projects)
          .where(eq(projects.organizationId, workspaceId)),
        db
          .select({
            id: surveys.id,
            title: surveys.title,
            status: surveys.status,
            userId: surveys.userId,
            projectId: surveys.projectId,
            shareableLink: surveys.shareableLink,
            createdAt: surveys.createdAt,
            updatedAt: surveys.updatedAt,
          })
          .from(surveys)
          .where(eq(surveys.organizationId, workspaceId)),
        getCurrentWorkspaceRevision(workspaceId),
      ]);

    return NextResponse.json({
      workspaceId,
      revision,
      members: workspaceMembers,
      projects: workspaceProjects,
      surveys: workspaceSurveys,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[Workspace Realtime Bootstrap] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
