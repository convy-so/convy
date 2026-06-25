import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/shared/http/api-error";

import { getVerifiedSession } from "@/features/auth/public-server";
import { listSurveysForUser } from "@/features/surveys/server/surveys-route-service";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";

export async function GET() {
  try {
    const session = await getVerifiedSession();

    const surveys = await listSurveysForUser(session.user.id);
    return NextResponse.json({ surveys });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "/api/surveys:get");
  }
}
