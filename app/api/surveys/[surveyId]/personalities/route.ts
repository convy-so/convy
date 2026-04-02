import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getPersonalityPreset,
  PERSONALITY_PRESETS,
  personalityOverlaySchema,
  personalityPresetIdSchema,
} from "@/lib/education/playbooks";
import {
  getActivePersonalityAssignment,
  replacePersonalityAssignment,
} from "@/lib/education/storage";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey)
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    const permission = await getSurveyPermissionContext(
      session.user.id,
      surveyId,
    );
    if (!permission?.canView)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const [sampleAssignment, liveAssignment] = await Promise.all([
      getActivePersonalityAssignment(surveyId, "sample"),
      getActivePersonalityAssignment(surveyId, "live"),
    ]);

    return NextResponse.json({
      presets: PERSONALITY_PRESETS,
      active: {
        sample: sampleAssignment?.assignment ?? null,
        live: liveAssignment?.assignment ?? null,
      },
    });
  } catch (error) {
    console.error("[Personalities GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey)
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    const permission = await getSurveyPermissionContext(
      session.user.id,
      surveyId,
    );
    if (!permission?.canEdit) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const mode: "live" | "sample" = body.mode === "live" ? "live" : "sample";
    const presetId = personalityPresetIdSchema.parse(body.presetId);
    const overlay = personalityOverlaySchema.parse(body.overlay ?? {});

    const current = await getActivePersonalityAssignment(surveyId, mode);
    const assignment = {
      version: (current?.assignment.version ?? 0) + 1,
      mode,
      presetId,
      overlay,
      createdAt: new Date().toISOString(),
    };

    await replacePersonalityAssignment({
      surveyId,
      mode,
      assignment,
    });

    if (body.applyToLive && mode === "sample") {
      const liveCurrent = await getActivePersonalityAssignment(
        surveyId,
        "live",
      );
      await replacePersonalityAssignment({
        surveyId,
        mode: "live",
        assignment: {
          ...assignment,
          mode: "live",
          version: (liveCurrent?.assignment.version ?? 0) + 1,
          createdAt: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      preset: getPersonalityPreset(presetId),
      assignment,
    });
  } catch (error) {
    console.error("[Personalities POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
