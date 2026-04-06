import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import {
  createDeletionJob,
  createPrivacyRequest,
  deleteUserPrivacyData,
  markDeletionJobStatus,
  markPrivacyRequestResolved,
} from "@/lib/privacy/service";

export async function POST() {
  let privacyRequestId: string | null = null;
  let deletionJobId: string | null = null;

  try {
    const session = await getVerifiedSession();
    const privacyRequest = await createPrivacyRequest({
      userId: session.user.id,
      subjectType: "user",
      requestType: "delete_account",
    });
    privacyRequestId = privacyRequest.id;
    const deletionJob = await createDeletionJob({
      privacyRequestId: privacyRequest.id,
      jobType: "delete_account",
      targetType: "user",
      targetId: session.user.id,
    });
    deletionJobId = deletionJob.id;

    await markDeletionJobStatus({
      deletionJobId,
      status: "in_progress",
    });

    await deleteUserPrivacyData(session.user.id);

    await markDeletionJobStatus({
      deletionJobId,
      status: "completed",
    });

    await markPrivacyRequestResolved({
      requestId: privacyRequest.id,
      status: "completed",
      resultPayload: {
        deletionJobId: deletionJob.id,
      },
    });

    return NextResponse.json({
      success: true,
      requestId: privacyRequest.id,
      deletionJobId: deletionJob.id,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (deletionJobId) {
      await markDeletionJobStatus({
        deletionJobId,
        status: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => undefined);
    }
    if (privacyRequestId) {
      await markPrivacyRequestResolved({
        requestId: privacyRequestId,
        status: "failed",
        resultPayload: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }).catch(() => undefined);
    }

    return NextResponse.json({ error: "Failed to delete account" }, { status: 400 });
  }
}
