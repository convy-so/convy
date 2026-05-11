
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { mapSessionAuthError } from "@/lib/route-auth-error";
import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

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

        if (!isSurveyStatus(status)) { return apiError("VALIDATION_ERROR", "Invalid status"); }

        // Get survey to verify ownership
        const [survey] = await getDb()
            .select()
            .from(surveys)
            .where(eq(surveys.id, surveyId));

        if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

        const permission = await getSurveyPermissionForSession(session, surveyId);
        if (!hasSurveyPermission(permission, "canEdit")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

        await getDb()
            .update(surveys)
            .set({
                status,
                updatedAt: new Date(),
            })
            .where(eq(surveys.id, surveyId));

        return NextResponse.json({ success: true, status });
    } catch (error) {
        const authError = mapSessionAuthError(error); if (authError) return authError; return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/status:patch");
    }
}

