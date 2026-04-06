import { NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/session";
import { isWorkspaceOwner } from "@/lib/workspace-access";
import {
  createPrivacyRequest,
  exportUserPrivacyData,
  exportWorkspacePrivacyData,
  markPrivacyRequestResolved,
} from "@/lib/privacy/service";

const bodySchema = z.object({
  scope: z.enum(["user", "workspace"]).default("user"),
  organizationId: z.string().optional(),
});

export async function POST(request: Request) {
  let privacyRequestId: string | null = null;

  try {
    const session = await getVerifiedSession();
    const body = bodySchema.parse(await request.json());
    const organizationId =
      body.scope === "workspace"
        ? body.organizationId ?? session.session.activeOrganizationId ?? null
        : body.organizationId ?? null;

    const privacyRequest = await createPrivacyRequest({
      organizationId,
      userId: session.user.id,
      subjectType: body.scope,
      requestType: "export",
      requestPayload: body,
    });
    privacyRequestId = privacyRequest.id;

    const payload =
      body.scope === "workspace"
        ? await (async () => {
            if (!organizationId || !(await isWorkspaceOwner(session.user.id, organizationId))) {
              throw new Error("Unauthorized");
            }

            return await exportWorkspacePrivacyData(organizationId);
          })()
        : await exportUserPrivacyData(session.user.id);

    await markPrivacyRequestResolved({
      requestId: privacyRequest.id,
      status: "completed",
      resultPayload: {
        scope: body.scope,
      },
    });

    return NextResponse.json({
      success: true,
      requestId: privacyRequest.id,
      data: payload,
    });
  } catch (error) {
    if (privacyRequestId) {
      await markPrivacyRequestResolved({
        requestId: privacyRequestId,
        status: "failed",
        resultPayload: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }).catch(() => undefined);
    }

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
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Failed to export privacy data" }, { status: 400 });
  }
}
