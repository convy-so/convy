import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { getStudentTopicAccess } from "@/lib/learning/access";
import { extractMessageText, toPersistedUIChatMessages } from "@/lib/chat-ui-messages";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/lib/ai";
import {
  appendLearningMessage,
  createLearningSession,
  getActiveLearningSession,
  getLearningSessionById,
  listLearningMessages,
  logLearningInteraction,
  updateLearningSessionState,
} from "@/lib/learning/storage";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
import { generateSessionOpening } from "@/lib/learning/tutor";
import {
  finalizeTutoringSession,
  shouldAutoCompleteTutoringSession,
  shouldRefreshStudentModel,
} from "@/lib/learning/tutoring-session-lifecycle";
import { learningSessionStateSchema } from "@/lib/learning/types";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { evaluateScopePolicy } from "@/lib/ai/scope-policy";
import { sanitizeUserInput } from "@/lib/ai/sanitization";
import { studentModelService } from "@/lib/learning/student-model-service";
import { logBraintrustTrace } from "@/lib/ai/braintrust";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).default([]),
});

function getLatestUserMessage(messages: UIMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "user");
}

async function ensureTutoringSession(params: {
  topicId: string;
  access: NonNullable<Awaited<ReturnType<typeof getStudentTopicAccess>>>;
  sessionId?: string;
  studyLanguage: string;
}) {
  const requestedSession = params.sessionId
    ? await getLearningSessionById(params.sessionId)
    : null;
  const existing =
    (requestedSession &&
    requestedSession.sessionStatus === "active" &&
    requestedSession.sessionType === "tutoring" &&
    requestedSession.topicId === params.topicId &&
    requestedSession.classroomStudentId === params.access.classroomStudent.id &&
    requestedSession.sessionLocale === params.studyLanguage
      ? requestedSession
      : null) ??
    (await getActiveLearningSession({
      classroomStudentId: params.access.classroomStudent.id,
      topicId: params.topicId,
      sessionType: "tutoring",
      sessionLocale: params.studyLanguage,
    }));

  if (existing) {
    return existing;
  }

  const state = await tutorRuntimeService.initializeSessionState({
    topicId: params.topicId,
    topicTitle: params.access.topic.title,
    sourceBoundary: params.access.topic.sourceBoundary,
    classroomId: params.access.topic.classroomId,
    classroomStudentId: params.access.classroomStudent.id,
    studentUserId: params.access.classroomStudent.userId,
    studyLanguage: params.studyLanguage,
  });

  const session = await createLearningSession({
    topicId: params.topicId,
    classroomStudentId: params.access.classroomStudent.id,
    sessionType: "tutoring",
    sessionLocale: params.studyLanguage,
    state,
  });

  const opening = await generateSessionOpening({
    topicTitle: params.access.topic.title,
    studyLanguage: params.studyLanguage,
    worldConnection:
      params.access.classroomStudent.interestProfile?.profile.primaryInterests[0]?.label ??
      null,
  }).catch(
    () =>
      `Let's work on ${params.access.topic.title}. Start by telling me how you currently think about this topic.`,
  );

  await appendLearningMessage({
    sessionId: session.id,
    role: "assistant",
    content: opening,
    metadata: {
      messageKind: "session_opening",
    },
  });

  await logLearningInteraction({
    classroomStudentId: params.access.classroomStudent.id,
    topicId: params.topicId,
    sessionId: session.id,
    role: "assistant",
    interactionType: "tutor_message",
    content: opening,
    metadata: {
      messageKind: "session_opening",
    },
  });

  return session;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const { searchParams } = new URL(request.url);
    const access = await getStudentTopicAccess(session.user.id, topicId);
    const studyLanguage = normalizeAppLocale(
      searchParams.get("language") ??
        session.user.uiLocale ??
        session.user.preferredLanguage ??
        "en",
    );

    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!access.classroomStudent.interestProfile) {
      return NextResponse.json(
        { error: "Student profile onboarding is required before tutoring." },
        { status: 409 },
      );
    }

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      studyLanguage,
    });
    const messages = await listLearningMessages(tutorSession.id);
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});

    return NextResponse.json({
      success: true,
      data: {
        sessionId: tutorSession.id,
        sessionLocale: normalizeAppLocale(tutorSession.sessionLocale),
        sourceLocale: access.topic.contentLocale,
        topic: {
          id: access.topic.id,
          title: access.topic.title,
          subject: access.topic.subject,
          subjectKey: access.topic.subjectKey,
          subjectLabel: access.topic.subjectLabel,
        },
        sessionState: state,
        messages,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tutoring session" },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const access = await getStudentTopicAccess(session.user.id, topicId);

    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!access.classroomStudent.interestProfile) {
      return NextResponse.json(
        { error: "Student profile onboarding is required before tutoring." },
        { status: 409 },
      );
    }

    const body = requestSchema.parse(await request.json());
    const studyLanguage = normalizeAppLocale(
      body.language ?? session.user.uiLocale ?? session.user.preferredLanguage ?? "en",
    );
    const latestUserMessage = getLatestUserMessage(body.messages);
    const latestUserText = extractMessageText(
      latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null,
    ).trim();

    if (!latestUserText) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const scopeDecision = await evaluateScopePolicy({
      feature: "tutoring_chat",
      objective: `Help the student learn ${access.topic.title} using uploaded course materials`,
      currentPhase: "active tutoring session",
      activeTopic: access.topic.title,
      latestUserMessage: latestUserText,
      strictMode: true,
      driftCount: 0,
      allowedDetours: [
        "brief clarification of the current concept",
        "asking what a current term means",
        "replying in another supported language while staying on lesson",
      ],
    });

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      sessionId: body.sessionId,
      studyLanguage,
    });
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});

    if (scopeDecision.shouldRedirect) {
      await appendLearningMessage({
        sessionId: tutorSession.id,
        role: "user",
        content: latestUserText,
        metadata: {
          classification: scopeDecision.classification,
        },
      });
      await logLearningInteraction({
        classroomStudentId: access.classroomStudent.id,
        topicId,
        sessionId: tutorSession.id,
        role: "user",
        interactionType: "student_message",
        content: latestUserText,
        metadata: {
          classification: scopeDecision.classification,
        },
      });

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({
              type: "text-delta",
              id: `redirect-${Date.now()}`,
              delta: scopeDecision.redirectMessage,
            });
            await appendLearningMessage({
              sessionId: tutorSession.id,
              role: "assistant",
              content: scopeDecision.redirectMessage,
              metadata: {
                messageKind: "scope_redirect",
                classification: scopeDecision.classification,
              },
            });
            await logLearningInteraction({
              classroomStudentId: access.classroomStudent.id,
              topicId,
              sessionId: tutorSession.id,
              role: "assistant",
              interactionType: "tutor_message",
              content: scopeDecision.redirectMessage,
              metadata: {
                messageKind: "scope_redirect",
                classification: scopeDecision.classification,
              },
            });
          },
        }),
      });
    }

    await appendLearningMessage({
      sessionId: tutorSession.id,
      role: "user",
      content: latestUserText,
      metadata: {
        messageKind: "student_turn",
      },
    });
    await logLearningInteraction({
      classroomStudentId: access.classroomStudent.id,
      topicId,
      sessionId: tutorSession.id,
      role: "user",
      interactionType: "student_message",
      content: latestUserText,
      metadata: {
        messageKind: "student_turn",
      },
    });

    const previousAssistant = [...(await listLearningMessages(tutorSession.id))]
      .reverse()
      .find((message) => message.role === "assistant");

    const prepared = await tutorRuntimeService.prepareTurn({
      topicId,
      topicTitle: access.topic.title,
      sourceBoundary: access.topic.sourceBoundary,
      classroomId: access.topic.classroomId,
      classroomStudentId: access.classroomStudent.id,
      studentUserId: access.classroomStudent.userId,
      sessionId: tutorSession.id,
      studyLanguage,
      state,
      latestStudentMessage: latestUserText,
      latestTutorMessage: previousAssistant?.content ?? null,
    });

    // Sanitize conversation history before sending to the model
    const sanitizedMessages = (body.messages as any[]).map((m) => {
      if (m.role === "user") {
        return {
          ...m,
          content: sanitizeUserInput(m.content, {
            maxLength: 2000,
            allowNewlines: true,
          }),
        };
      }
      return m;
    });

    const modelMessages = await toModelMessages(sanitizedMessages);
    const result = streamAIResponse(modelMessages, prepared.systemPrompt, {
      userId: session.user.id,
      maxTokens: 900,
      temperature: 0.3,
      observability: {
        feature: "tutoring_chat",
        scenarioType: "student_turn",
        resourceType: "learning_session",
        resourceId: tutorSession.id,
        metadata: {
          topicId,
          runtimeModelId: prepared.runtimeModel.id,
          runtimeModelVersion: prepared.runtimeModel.version,
          frameworkVersionId: prepared.runtimeModel.frameworkVersionId,
          stageId: prepared.frameworkState.currentStageId,
          studentModelId: prepared.studentModel.id,
          contentScopeMaterialIds: prepared.contentScope.materialIds,
        },
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: body.messages,
      onFinish: async ({ messages }) => {
        const persistedMessages = toPersistedUIChatMessages(messages, ["assistant"]);
        const assistantMessage = persistedMessages.at(-1);
        const assistantText = assistantMessage?.content?.trim();

        if (!assistantText) {
          return;
        }

        await appendLearningMessage({
          sessionId: tutorSession.id,
          role: "assistant",
          content: assistantText,
          metadata: {
            frameworkStageId: prepared.frameworkState.currentStageId,
            runtimeModelId: prepared.runtimeModel.id,
            runtimeModelVersion: prepared.runtimeModel.version,
          },
        });
        await logLearningInteraction({
          classroomStudentId: access.classroomStudent.id,
          topicId,
          sessionId: tutorSession.id,
          role: "assistant",
          interactionType: "tutor_message",
          content: assistantText,
          metadata: {
            frameworkStageId: prepared.frameworkState.currentStageId,
          },
        });

        const autoComplete = shouldAutoCompleteTutoringSession({
          runtimeModel: prepared.runtimeModel,
          previousState: state,
          nextState: prepared.nextState,
        });
        const shouldUpdateStudentModel = shouldRefreshStudentModel({
          previousState: state,
          nextState: prepared.nextState,
          forcedCompletion: autoComplete,
        });
        const snapshot = shouldUpdateStudentModel
          ? await studentModelService.updateFromConversation({
              studentModelId: prepared.studentModel.id,
              topicId,
              sessionId: tutorSession.id,
              sourceType: "session_turn",
              sourceId: tutorSession.id,
              userId: session.user.id,
              existingSnapshot: prepared.latestStudentSnapshot,
              contentScope: prepared.contentScope,
              conversationExcerpt: [
                ...(previousAssistant?.content
                  ? [{ role: "assistant", content: previousAssistant.content }]
                  : []),
                { role: "user", content: latestUserText },
                { role: "assistant", content: assistantText },
              ],
            })
          : null;
        const refreshedAt = new Date().toISOString();
        const nextState = {
          ...prepared.nextState,
          studentModelSnapshotId: shouldUpdateStudentModel
            ? snapshot?.id ?? null
            : prepared.latestStudentSnapshotRecord?.id ?? null,
          recentEvidence: [
            ...prepared.nextState.recentEvidence,
            latestUserText,
            assistantText,
          ].slice(-8),
          turnCount: state.turnCount + 1,
          turnsSinceStudentModelRefresh: shouldUpdateStudentModel
            ? 0
            : state.turnsSinceStudentModelRefresh + 1,
          lastStudentModelRefreshAt: shouldUpdateStudentModel
            ? refreshedAt
            : state.lastStudentModelRefreshAt,
        };

        const persistedSession = await updateLearningSessionState({
          sessionId: tutorSession.id,
          state: nextState,
          expectedStateVersion: tutorSession.stateVersion ?? 1,
        });

        if (autoComplete) {
          await finalizeTutoringSession({
            sessionId: tutorSession.id,
            topicId,
            classroomId: access.topic.classroomId ?? "",
            classroomStudentId: access.classroomStudent.id,
            studentUserId: session.user.id,
            studentName: access.classroomStudent.fullName,
            topicTitle: access.topic.title,
            sourceLocale: access.topic.contentLocale,
            summary: assistantText,
            expectedStateVersion: persistedSession.stateVersion ?? 1,
            state: nextState,
            reason: "framework_complete",
          });
        }

        await logBraintrustTrace({
          event: "tutoring_turn",
          input: {
            topicId,
            sessionId: tutorSession.id,
            studentMessage: latestUserText,
          },
          output: {
            tutorMessage: assistantText,
          },
            metadata: {
              topicId,
              runtimeModelVersion: prepared.runtimeModel.version,
              frameworkVersion: prepared.runtimeModel.frameworkVersionId,
              studentModelSnapshotId: shouldUpdateStudentModel
                ? snapshot?.id
                : prepared.latestStudentSnapshotRecord?.id,
              materialIds: prepared.contentScope.materialIds,
              stageId: prepared.frameworkState.currentStageId,
              conflictState:
                prepared.runtimeModel.conflictIds.length > 0 ? "open" : "clear",
            autoCompleted: autoComplete,
            studentModelRefreshed: shouldUpdateStudentModel,
          },
        }).catch(() => undefined);
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to continue tutoring" },
      { status: 400 },
    );
  }
}
