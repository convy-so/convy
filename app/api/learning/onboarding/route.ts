import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";

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
import {
  appendLearningMessage,
  completeLearningSession,
  createLearningSession,
  createStudentModelSnapshot,
  getActiveLearningSession,
  listLearningMessages,
  markStudentOnboardingComplete,
  upsertInterestProfile,
} from "@/lib/learning/storage";
import { extractMessageText, toPersistedUIChatMessages } from "@/lib/chat-ui-messages";
import { studentModelService } from "@/lib/learning/student-model-service";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).default([]),
});

async function ensureOnboardingSession(classroomStudentId: string) {
  return (
    (await getActiveLearningSession({
      classroomStudentId,
      topicId: null,
      sessionType: "interest_onboarding",
    })) ??
    (await createLearningSession({
      classroomStudentId,
      topicId: null,
      sessionType: "interest_onboarding",
    }))
  );
}

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

    if (!membership) {
      return NextResponse.json({ error: "Student context not found" }, { status: 404 });
    }

    const body = requestSchema.parse(await request.json());
    const latestUserMessage = [...body.messages]
      .reverse()
      .find((message) => message.role === "user");
    const latestUserText = extractMessageText(
      latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null,
    ).trim();

    if (!latestUserText) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const activeSession = await ensureOnboardingSession(membership.id);
    await appendLearningMessage({
      sessionId: activeSession.id,
      role: "user",
      content: latestUserText,
    });

    const transcript = await listLearningMessages(activeSession.id);
    const studentModel = await studentModelService.ensureModel({
      classroomStudentId: membership.id,
      studentUserId: session.user.id,
    });
    const latestSnapshot = await studentModelService.getLatestSnapshot(studentModel.id);
    const result = await runInterestOnboardingTurn({
      studentName: membership.fullName,
      existingProfile: membership.interestProfile?.profile ?? null,
      existingStudentModel: latestSnapshot?.snapshot ?? null,
      messages: transcript.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    });

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({
            type: "text-delta",
            id: `onboarding-${Date.now()}`,
            delta: result.response,
          });
          await appendLearningMessage({
            sessionId: activeSession.id,
            role: "assistant",
            content: result.response,
            metadata: {
              status: result.status,
            },
          });

          if (
            result.status === "complete" &&
            result.interestProfile &&
            result.studentModelSnapshot
          ) {
            await upsertInterestProfile({
              classroomStudentId: membership.id,
              profile: result.interestProfile,
            });
            const snapshot = await createStudentModelSnapshot({
              studentModelId: studentModel.id,
              snapshot: result.studentModelSnapshot,
              sourceType: "onboarding",
              sourceId: activeSession.id,
            });

            await markStudentOnboardingComplete(membership.id);
            const teacherSummary = await generateTeacherOnboardingSummary({
              studentName: membership.fullName,
              profile: {
                interestProfile: result.interestProfile,
                studentModelSnapshot: result.studentModelSnapshot,
              },
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
              summary: `Onboarding complete. Student model snapshot ${snapshot.version} created.`,
              expectedStateVersion: activeSession.stateVersion ?? 1,
            });
          }
        },
      }),
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
