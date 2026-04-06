import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { playbookAuthorInputSchema } from "@/lib/education/playbooks";
import { compilePlaybookAuthorInput } from "@/lib/education/playbook-workflow";
import {
  createPlaybook,
  listPlaybooksForSurvey,
} from "@/lib/education/storage";
import {
  isWorkspaceOwner,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canView")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const records = await listPlaybooksForSurvey({
      surveyId,
      organizationId: survey.organizationId,
    });
    return NextResponse.json({
      playbooks: records.map((record) => ({
        playbook: record.playbook,
        activeVersion: record.activeVersion,
        isAttached: record.isAttached,
      })),
    });
  } catch (error) {
    console.error("[Playbooks GET] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const parsed = playbookAuthorInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const input = parsed.data;
    if (input.scope === "workspace") {
      if (!survey.organizationId) {
        return NextResponse.json({ error: "Workspace playbooks require a workspace survey." }, { status: 400 });
      }
      const isOwner = await isWorkspaceOwner(session.user.id, survey.organizationId);
      if (!isOwner) {
        return NextResponse.json({ error: "Only workspace owners can create workspace playbooks." }, { status: 403 });
      }
    }

    const compiled = await compilePlaybookAuthorInput(input);
    const created = await createPlaybook({
      surveyId,
      organizationId: survey.organizationId,
      createdBy: session.user.id,
      scope: input.scope,
      phase: input.phase,
      name: input.name,
      input,
      interpretation: compiled.interpretation,
      preview: compiled.preview,
      status: compiled.status,
      attachToSurveyId: input.scope === "workspace" ? surveyId : null,
    });

    return NextResponse.json({
      playbook: created.playbook,
      version: created.version,
      interpretation: compiled.interpretation,
      preview: compiled.preview,
      status: compiled.status,
    });
  } catch (error) {
    console.error("[Playbooks POST] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
