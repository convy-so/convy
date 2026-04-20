import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getPrimaryStudentMembership } from "@/lib/learning/access";
import {
  buildOnboardingGreeting,
  runInterestOnboardingTurn,
  shouldRefreshInterestProfile,
} from "@/lib/learning/onboarding";
import { generateTeacherOnboardingSummary } from "@/lib/learning/reporting";
import { enqueueLearningPatternAnalysis } from "@/lib/queue";
import {
  appendLearningMessage,
  completeLearningSession,
  createLearningSession,
  getActiveLearningSession,
  listLearningMessages,
  markStudentOnboardingComplete,
  upsertInterestProfile,
} from "@/lib/learning/storage";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const membership = await getPrimaryStudentMembership(session.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Student context not found" }, { status: 404 });
    }

    if (
      membership.interestProfile &&
      !shouldRefreshInterestProfile(membership.interestProfile.profile)
    ) {
      return NextResponse.json({
        completed: true,
        profile: membership.interestProfile.profile,
      });
    }

    let activeSession = await getActiveLearningSession({
      classroomStudentId: membership.id,
      topicId: null,
      sessionType: "interest_onboarding",
    });

    if (!activeSession) {
      activeSession = await createLearningSession({
        classroomStudentId: membership.id,
        topicId: null,
        sessionType: "interest_onboarding",
      });
      await appendLearningMessage({
        sessionId: activeSession.id,
        role: "assistant",
        content: buildOnboardingGreeting(membership.fullName),
      });
    }

    const messages = await listLearningMessages(activeSession.id);
    return NextResponse.json({
      completed: false,
      sessionId: activeSession.id,
      messages,
    });
      } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load onboarding",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const membership = await getPrimaryStudentMembership(session.user.id);
    const body = (await request.json()) as { sessionId?: string; message?: string };

    if (!membership) {
      return NextResponse.json({ error: "Student context not found" }, { status: 404 });
    }

    if (!body.message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const activeSession =
      (body.sessionId
        ? await getActiveLearningSession({
            classroomStudentId: membership.id,
            topicId: null,
            sessionType: "interest_onboarding",
          })
        : null) ??
      (await getActiveLearningSession({
        classroomStudentId: membership.id,
        topicId: null,
        sessionType: "interest_onboarding",
      })) ??
      (await createLearningSession({
        classroomStudentId: membership.id,
        topicId: null,
        sessionType: "interest_onboarding",
      }));

    await appendLearningMessage({
      sessionId: activeSession.id,
      role: "user",
      content: body.message.trim(),
    });

    const transcript = await listLearningMessages(activeSession.id);
    const result = await runInterestOnboardingTurn({
      studentName: membership.fullName,
      existingProfile: membership.interestProfile?.profile ?? null,
      messages: transcript.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    });

    await appendLearningMessage({
      sessionId: activeSession.id,
      role: "assistant",
      content: result.response,
      metadata: {
        status: result.status,
      },
    });

    if (result.status === "complete" && result.profile) {
      await upsertInterestProfile({
        classroomStudentId: membership.id,
        profile: result.profile,
      });
      await markStudentOnboardingComplete(membership.id);
      const teacherSummary = await generateTeacherOnboardingSummary({
        studentName: membership.fullName,
        profile: result.profile,
      });

      await getDb().insert(notifications).values({
        id: nanoid(),
        userId: membership.classroom.teacherUserId,
        title: `${membership.fullName} onboarding summary`,
        message: teacherSummary.summary,
        type: "info",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await completeLearningSession({
        sessionId: activeSession.id,
        summary: "Interest profile completed.",
        expectedStateVersion: activeSession.stateVersion ?? 1,
      });

      if (membership.classroom.organizationId) {
        await enqueueLearningPatternAnalysis({
          sourceType: "onboarding",
          sourceId: activeSession.id,
          organizationId: membership.classroom.organizationId,
          studentUserId: session.user.id,
          classroomStudentId: membership.id,
        }).catch((error) => {
          console.error("[learning:onboarding] failed to enqueue pattern analysis", {
            sessionId: activeSession.id,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        });
      }
    }

    return NextResponse.json({
      sessionId: activeSession.id,
      response: result.response,
      completed: result.status === "complete",
      profile: result.profile,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to continue onboarding",
      },
      { status: 400 },
    );
  }
}

