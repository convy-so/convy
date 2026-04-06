import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { playbooks, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { playbookAuthorInputSchema } from "@/lib/education/playbooks";
import { compilePlaybookAuthorInput } from "@/lib/education/playbook-workflow";
import {
  approvePlaybookVersion,
  archivePlaybook,
  attachPlaybookToSurvey,
  createPlaybookVersion,
  detachPlaybookFromSurvey,
} from "@/lib/education/storage";
import {
  isWorkspaceOwner,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string; playbookId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, playbookId } = await params;
    const body = await req.json();
    const action = String(body.action || "");

    const [survey, playbook] = await Promise.all([
      getDb().select().from(surveys).where(eq(surveys.id, surveyId)).then((rows) => rows[0]),
      getDb().select().from(playbooks).where(eq(playbooks.id, playbookId)).then((rows) => rows[0]),
    ]);
    if (!survey || !playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (playbook.scope === "workspace" && survey.organizationId) {
      const isOwner = await isWorkspaceOwner(session.user.id, survey.organizationId);
      if (!isOwner && action !== "attach" && action !== "detach") {
        return NextResponse.json({ error: "Only workspace owners can edit workspace playbooks." }, { status: 403 });
      }
    }

    switch (action) {
      case "approve": {
        const versionId = String(body.versionId || playbook.activeVersionId || "");
        if (!versionId) {
          return NextResponse.json({ error: "versionId is required" }, { status: 400 });
        }
        await approvePlaybookVersion({ playbookId, versionId, approvedBy: session.user.id });
        return NextResponse.json({ success: true });
      }
      case "archive": {
        await archivePlaybook(playbookId);
        return NextResponse.json({ success: true });
      }
      case "attach": {
        await attachPlaybookToSurvey({
          surveyId,
          playbookId,
          attachedBy: session.user.id,
        });
        return NextResponse.json({ success: true });
      }
      case "detach": {
        await detachPlaybookFromSurvey(surveyId, playbookId);
        return NextResponse.json({ success: true });
      }
      case "edit": {
        const parsed = playbookAuthorInputSchema.safeParse(body.input);
        if (!parsed.success) {
          return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
        }
        const compiled = await compilePlaybookAuthorInput(parsed.data);
        const version = await createPlaybookVersion({
          playbookId,
          createdBy: session.user.id,
          input: parsed.data,
          interpretation: compiled.interpretation,
          preview: compiled.preview,
          status: compiled.status,
        });
        return NextResponse.json({
          success: true,
          version,
          interpretation: compiled.interpretation,
          preview: compiled.preview,
          status: compiled.status,
        });
      }
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Playbook PATCH] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
