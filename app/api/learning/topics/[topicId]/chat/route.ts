import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/dal";
import { extractMessageText, toPersistedUIChatMessages, toUIMessages } from "@/lib/chat-ui-messages";
import {
  appendLearningMessage,
  listLearningMessages,
  logLearningInteraction,
  persistTutorTurnOutcome,
} from "@/lib/learning/storage";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
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
import { getDynamicFewShotExamples } from "@/lib/ai/few-shot-library";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import {
  ensureTutoringSession,
  resolveStudyLanguage,
  resolveStudentTutoringContext,
} from "@/lib/learning/tutoring-route-orchestrator";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

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

async function logUserTurn(params: {
  sessionId: string;
  classroomStudentId: string;
  topicId: string;
  content: string;
  metadata: Record<string, unknown>;
}) {
  await appendLearningMessage({
    sessionId: params.sessionId,
    role: "user",
    content: params.content,
    metadata: params.metadata,
  });
  await logLearningInteraction({
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    sessionId: params.sessionId,
    role: "user",
    interactionType: "student_message",
    content: params.content,
    metadata: params.metadata,
  });
}

function buildScopeRedirectResponse(params: {
  sessionId: string;
  classroomStudentId: string;
  topicId: string;
  classification: string;
  redirectMessage: string;
}) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({
          type: "text-delta",
          id: `redirect-${crypto.randomUUID()}`,
          delta: params.redirectMessage,
        });
        await appendLearningMessage({
          sessionId: params.sessionId,
          role: "assistant",
          content: params.redirectMessage,
          metadata: {
            messageKind: "scope_redirect",
            classification: params.classification,
          },
        });
        await logLearningInteraction({
          classroomStudentId: params.classroomStudentId,
          topicId: params.topicId,
          sessionId: params.sessionId,
          role: "assistant",
          interactionType: "tutor_message",
          content: params.redirectMessage,
          metadata: {
            messageKind: "scope_redirect",
            classification: params.classification,
          },
        });
      },
    }),
  });
}

async function prepareTutoringTurn(params: {
  topicId: string;
  access: NonNullable<Awaited<ReturnType<typeof resolveStudentTutoringContext>>["access"]>;
  tutorSessionId: string;
  studyLanguage: string;
  state: z.infer<typeof learningSessionStateSchema>;
  latestUserText: string;
  messages: UIMessage[];
}) {
  const previousAssistant = [...(await listLearningMessages(params.tutorSessionId))]
    .reverse()
    .find((message) => message.role === "assistant");

  const [prepared, fewShotExamples] = await Promise.all([
    tutorRuntimeService.prepareAgentTurn({
      topicId: params.topicId,
      topicTitle: params.access.topic.title,
      sourceBoundary: params.access.topic.sourceBoundary,
      classroomId: params.access.topic.classroomId,
      classroomStudentId: params.access.classroomStudent.id,
      studentUserId: params.access.classroomStudent.userId,
      sessionId: params.tutorSessionId,
      studyLanguage: params.studyLanguage,
      state: params.state,
      latestStudentMessage: params.latestUserText,
      latestTutorMessage: previousAssistant?.content ?? null,
    }),
    getDynamicFewShotExamples({
      feature: "tutoring",
      limit: 3,
      context: [params.latestUserText, params.access.topic.title, params.access.topic.subject]
        .filter(Boolean)
        .join(" | "),
    }),
  ]);

  const { createTutorTools } = await import("@/lib/learning/agent-tools");
  const tools = createTutorTools({
    topicId: params.topicId,
    contentLocale: params.access.topic.contentLocale,
  });

  const sanitizedMessages = toUIMessages(
    toPersistedUIChatMessages(params.messages).map((m) =>
      m.role === "user"
        ? {
            ...m,
            content: sanitizeUserInput(m.content, { maxLength: 2000, allowNewlines: true }),
          }
        : m,
    ),
  );

  return { previousAssistant, prepared, fewShotExamples, tools, sanitizedMessages };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const { searchParams } = new URL(request.url);
    const { access, studyLanguage } = await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
      language: searchParams.get("language"),
      preferredLanguage: session.user.preferredLanguage,
    });

    if (!access) return apiError("UNAUTHORIZED", "Unauthorized");

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
    return apiUnhandledError(
      error,
      "Failed to load tutoring session",
      "learning-topic-chat:get",
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
    const { access } = await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
    });

    if (!access) return apiError("UNAUTHORIZED", "Unauthorized");

    const body = requestSchema.parse(await request.json());
    const studyLanguage = resolveStudyLanguage({
      language: body.language,
      preferredLanguage: session.user.preferredLanguage,
    });
    const latestUserMessage = getLatestUserMessage(body.messages);
    const latestUserText = extractMessageText(
      latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null,
    ).trim();

    if (!latestUserText) {
      return apiError("VALIDATION_ERROR", "Message is required");
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
      await logUserTurn({
        sessionId: tutorSession.id,
        classroomStudentId: access.classroomStudent.id,
        topicId,
        content: latestUserText,
        metadata: {
          classification: scopeDecision.classification,
        },
      });
      return buildScopeRedirectResponse({
        sessionId: tutorSession.id,
        classroomStudentId: access.classroomStudent.id,
        topicId,
        classification: scopeDecision.classification,
        redirectMessage: scopeDecision.redirectMessage,
      });
    }

    await logUserTurn({
      sessionId: tutorSession.id,
      classroomStudentId: access.classroomStudent.id,
      topicId,
      content: latestUserText,
      metadata: {
        messageKind: "student_turn",
      },
    });

    const { previousAssistant, prepared, fewShotExamples, tools, sanitizedMessages } =
      await prepareTutoringTurn({
        topicId,
        access,
        tutorSessionId: tutorSession.id,
        studyLanguage,
        state,
        latestUserText,
        messages: body.messages,
      });

    const { streamAgentResponse } = await import("@/lib/ai");

    return await streamAgentResponse(sanitizedMessages, prepared.systemPrompt, {
      attribution: {
        userId: session.user.id,
        feature: "learning-tutor-chat",
      },
      tools,
      maxTokens: 1000,
      temperature: 0.3,
      dynamicExamples: fewShotExamples,
      onFinish: async (result) => {
        // Find the last assistant message in the steps
        const lastStep = result.steps.at(-1);
        const assistantText = lastStep?.text?.trim();

        if (!assistantText) {
          return;
        }

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
              contentScope: {
                ...prepared.baselineScope,
                // Include whatever we actually retrieved during the turn
                retrievedContext: result.steps
                  .flatMap((s) => s.toolResults)
                  .flatMap((r) => {
                    // Type-safe check for our specific tool
                    if (r.toolName === "search_course_materials") {
                      // We know the structure of search_course_materials output
                      const searchOutput = r.output as {
                        success: boolean;
                        results?: Array<{ content: string; materialId: string }>;
                      };
                      return searchOutput.results?.map((res) => res.content) || [];
                    }
                    return [];
                  }),
              },
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

        const persistedSession = await persistTutorTurnOutcome({
          sessionId: tutorSession.id,
          classroomStudentId: access.classroomStudent.id,
          topicId,
          assistantText,
          assistantMetadata: {
            frameworkStageId: prepared.frameworkState.currentStageId,
            runtimeModelId: prepared.runtimeModel.id,
            runtimeModelVersion: prepared.runtimeModel.version,
            toolCalls: result.steps.flatMap((s) => s.toolCalls),
          },
          interactionMetadata: {
            frameworkStageId: prepared.frameworkState.currentStageId,
          },
          nextState,
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
            steps: result.steps.length,
          },
          metadata: {
            topicId,
            runtimeModelVersion: prepared.runtimeModel.version,
            frameworkVersion: prepared.runtimeModel.frameworkVersionId,
            studentModelSnapshotId: shouldUpdateStudentModel
              ? snapshot?.id
              : prepared.latestStudentSnapshotRecord?.id,
            materialIds: prepared.baselineScope.materialIds,
            stageId: prepared.frameworkState.currentStageId,
            conflictState:
              prepared.runtimeModel.conflictIds.length > 0 ? "open" : "clear",
            autoCompleted: autoComplete,
            studentModelRefreshed: shouldUpdateStudentModel,
            toolUse: result.steps.some((s) => s.toolCalls.length > 0),
          },
        }).catch(() => undefined);
      },
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to continue tutoring",
      "learning-topic-chat:post",
    );
  }
}
