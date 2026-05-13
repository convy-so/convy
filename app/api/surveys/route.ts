import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import { listSurveysForUser } from "@/lib/surveys/surveys-route-service";
import { mapSessionAuthError } from "@/lib/route-auth-error";

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
