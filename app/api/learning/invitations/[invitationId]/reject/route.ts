import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/lib/api/error-contract";
import { getVerifiedSession } from "@/lib/auth/session";
import { respondToInvitation } from "@/lib/learning/student-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { invitationId } = await params;
    await respondToInvitation({ invitationId, userId: session.user.id, decision: "rejected" });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiUnhandledError(error, "Failed to reject invitation", "/api/learning/invitations/[invitationId]/reject");
  }
}
