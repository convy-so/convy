import { NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/session";
import { isWorkspaceOwner } from "@/lib/workspace-access";
import { createPrivacyRequest } from "@/lib/privacy/service";

const bodySchema = z.object({
  scope: z.enum(["user", "workspace"]).default("user"),
  requestType: z.enum([
    "rectification",
    "restriction",
    "objection",
    "delete_workspace_content",
  ]),
  organizationId: z.string().min(1).optional(),
  details: z.string().trim().max(4000).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = bodySchema.parse(await request.json());
    const organizationId =
      body.scope === "workspace"
        ? body.organizationId ?? session.session.activeOrganizationId ?? undefined
        : undefined;

    if (body.scope === "workspace") {
      if (!organizationId) {
        return NextResponse.json(
          { error: "Organization ID is required for workspace privacy requests." },
          { status: 400 },
        );
      }

      const isOwner = await isWorkspaceOwner(session.user.id, organizationId);
      if (!isOwner) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    const privacyRequest = await createPrivacyRequest({
      organizationId: organizationId ?? null,
      userId: session.user.id,
      subjectType: body.scope,
      requestType: body.requestType,
      requestPayload: {
        details: body.details ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      requestId: privacyRequest.id,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create privacy request" },
      { status: 400 },
    );
  }
}
