
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

function isSurveyStatus(value: unknown): value is "active" | "paused" {
    return value === "active" || value === "paused";
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ surveyId: string }> }
) {
    try {
        const session = await getVerifiedSession();
        const { surveyId } = await params;
        const body = await request.json();
        const status = typeof body?.status === "string" ? body.status : null;

        if (!isSurveyStatus(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        // Get survey to verify ownership
        const [survey] = await getDb()
            .select()
            .from(surveys)
            .where(eq(surveys.id, surveyId));

        if (!survey) {
            return NextResponse.json({ error: "Survey not found" }, { status: 404 });
        }

        const permission = await getSurveyPermissionForSession(session, surveyId);
        if (!hasSurveyPermission(permission, "canEdit")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Update survey status
        await getDb().transaction(async (tx) => {
            await tx
                .update(surveys)
                .set({
                    status,
                    updatedAt: new Date(),
                })
                .where(eq(surveys.id, surveyId));

            if (survey.organizationId) {
                await recordRealtimeEvent(tx, {
                    scope: "workspace",
                    workspaceId: survey.organizationId,
                    actorId: session.user.id,
                    eventType: "workspace.survey_updated",
                    payload: {
                        surveyId,
                        workspaceId: survey.organizationId,
                        status,
                    },
                });
            }
        });

        return NextResponse.json({ success: true, status });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
                return NextResponse.json({ error: error.message }, { status: 401 });
            }
        }
        console.error("Error updating survey status:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
