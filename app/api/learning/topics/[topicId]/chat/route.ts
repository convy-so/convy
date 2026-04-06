import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { learningSessions } from "@/db/schema";
import { assembleAiContext } from "@/lib/ai/context-assembler";
import { listActiveExpertGuidance, renderExpertGuidanceContext } from "@/lib/ai/guidance";
import {
  createAiRunTrace,
  finishAiRunTrace,
  recordAiFeedbackEvent,
  recordAiStep,
  recordAiContextLayers,
} from "@/lib/ai/observability";
import { getVerifiedSession } from "@/lib/auth/session";
import { getPlatformRole } from "@/lib/auth/roles";
import { getLearningSessionById } from "@/lib/learning/storage";
import { getStudentTopicAccess } from "@/lib/learning/access";
import { isMem0Configured, searchLearningPatternMemories } from "@/lib/learning/mem0";
import { logTutorMediaUsage, selectTutorMedia } from "@/lib/learning/media";
import {
  buildTeachingPlaybook,
  deriveSubjectInfo,
  renderTeachingPlaybookContext,
} from "@/lib/learning/patterns";
import {
  type TutoringRuntimeContext,
  buildLearningSessionState,
  runTutoringSessionTurn,
} from "@/lib/learning/session-engine";
import {
  appendLearningMessage,
  completeLearningSession,
  createLearningSession,
  getActiveLearningSession,
  getLatestCompletedLearningSession,
  getLatestStudentProgressReport,
  listLearningMessages,
  listStudentLearningPatternProfiles,
  logLearningInteraction,
  updateLearningSessionState,
} from "@/lib/learning/storage";
import { enqueueTutoringReportGeneration } from "@/lib/queue";
import {
  learningSessionStateSchema,
  type LearningSessionState,
  type QuestionIntent,
} from "@/lib/learning/types";
import type { LearningTeachingPlaybook } from "@/lib/learning/pattern-types";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { evaluateScopePolicy } from "@/lib/ai/scope-policy";

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function formatMemoriesAsContext(
  records: Array<{ memory?: string; metadata?: Record<string, unknown> }>,
) {
  if (records.length === 0) return "";

  return records
    .map((record) => {
      const memory = record.memory?.trim();
      if (!memory) return null;
      const dimension =
        typeof record.metadata?.dimension === "string"
          ? ` (${record.metadata.dimension})`
          : "";
      return `- ${memory}${dimension}`;
    })
    .filter(Boolean)
    .join("\n");
}

async function buildTutoringRuntimeContext(params: {
  access: NonNullable<Awaited<ReturnType<typeof getStudentTopicAccess>>>;
  teachingPlaybook: LearningTeachingPlaybook | null;
}) {
  const guidance = await listActiveExpertGuidance({
    feature: "tutoring_chat",
    artifactTypes: [
      "pedagogy_strategy",
      "misconception_rules",
      "social_tutoring",
      "media_rules",
      "grade_band_guidance",
    ],
    selectors: {
      organizationId: params.access.topic.classroom.organizationId,
      classroomId: params.access.topic.classroomId,
      topicId: params.access.topic.id,
      subjectKey: params.access.topic.subjectKey,
      gradeBand: params.access.topic.classroom.gradeBand,
    },
  });

  const memoryRecords =
    isMem0Configured() && params.access.classroomStudent.userId
      ? await searchLearningPatternMemories({
          studentUserId: params.access.classroomStudent.userId,
          query: `${params.access.topic.title} ${params.access.topic.subject ?? ""}`.trim(),
          subjectKey: params.access.topic.subjectKey,
          limit: 4,
        }).catch(() => [])
      : [];

  const expertGuidance = renderExpertGuidanceContext(
    guidance.filter((item) => item.artifactType !== "social_tutoring"),
  );
  const socialGuidance = renderExpertGuidanceContext(
    guidance.filter((item) => item.artifactType === "social_tutoring"),
  );
  const memoryContext = formatMemoriesAsContext(memoryRecords);
  const userOverlay = params.teachingPlaybook
    ? renderTeachingPlaybookContext(params.teachingPlaybook)
    : "";

  const contextLayers = assembleAiContext([
    {
      kind: "product_policy",
      label: "Tutoring product policy",
      content:
        "Stay grounded in teacher-approved materials for factual claims. Keep the tutor workflow-first, warm, and age-appropriate.",
      sourceType: "product_policy",
      sourceId: "tutoring-core",
      versionId: "v2.2",
    },
    {
      kind: "workflow_state",
      label: "Active tutoring workflow",
      content: `Topic: ${params.access.topic.title}\nGrade band: ${params.access.topic.classroom.gradeBand}\nLearning outcomes: ${params.access.topic.learningOutcomes.map((item) => item.title).join(", ")}`,
      sourceType: "topic",
      sourceId: params.access.topic.id,
    },
    {
      kind: "expert_guidance",
      label: "Expert tutor guidance",
      content: expertGuidance,
      sourceType: "expert_guidance",
      sourceId: "tutoring_chat",
      versionId: guidance.map((item) => item.versionId).join(","),
    },
    {
      kind: "memory",
      label: "Student learning memory",
      content: memoryContext,
      sourceType: "mem0",
      sourceId: params.access.classroomStudent.userId ?? params.access.classroomStudent.id,
    },
    {
      kind: "user_overlay",
      label: "Current teaching playbook",
      content: userOverlay,
      sourceType: "teaching_playbook",
      sourceId: params.access.classroomStudent.id,
    },
  ]);

  const runtimeContext: TutoringRuntimeContext = {
    expertGuidance,
    socialGuidance,
    memoryContext,
    userOverlay,
    organizationId: params.access.topic.classroom.organizationId,
    metadata: {
      topicId: params.access.topic.id,
      classroomStudentId: params.access.classroomStudent.id,
      subjectKey: params.access.topic.subjectKey,
      guidanceVersionIds: guidance.map((item) => item.versionId),
    },
  };

  return {
    runtimeContext,
    contextLayers,
  };
}

async function hydrateSessionTeachingPlaybook(params: {
  state: LearningSessionState;
  access: NonNullable<Awaited<ReturnType<typeof getStudentTopicAccess>>>;
  previousSession?: Awaited<ReturnType<typeof getLatestCompletedLearningSession>> | null;
  previousReport?: Awaited<ReturnType<typeof getLatestStudentProgressReport>> | null;
}) {
  if (!params.access.classroomStudent.userId) {
    return params.state;
  }

  const profiles = await listStudentLearningPatternProfiles({
    organizationId: params.access.topic.classroom.organizationId,
    studentUserId: params.access.classroomStudent.userId,
  });

  const subjectInfo = deriveSubjectInfo({
    subjectKey: params.access.topic.subjectKey,
    subjectLabel: params.access.topic.subjectLabel,
    subject: params.access.topic.subject,
  });

  const previousSessionState = learningSessionStateSchema.safeParse(
    params.previousSession?.state ?? {},
  );

  const teachingPlaybook: LearningTeachingPlaybook = buildTeachingPlaybook({
    globalProfile:
      profiles.find((profile) => profile.scopeType === "global")?.profile ?? null,
    subjectProfile:
      profiles.find(
        (profile) =>
          profile.scopeType === "subject" &&
          profile.subjectKey === subjectInfo.subjectKey,
      )?.profile ?? null,
    topicLocalGaps: uniqueStrings([
      ...params.state.gapsIdentified,
      ...(params.previousReport?.report.identifiedGaps ?? []),
    ]),
    topicLocalUsedExamples: uniqueStrings([
      ...(previousSessionState.success ? previousSessionState.data.usedExampleLog : []),
      ...params.state.usedExampleLog,
    ]),
  });

  return learningSessionStateSchema.parse({
    ...params.state,
    usedExampleLog: uniqueStrings([
      ...(previousSessionState.success ? previousSessionState.data.usedExampleLog : []),
      ...params.state.usedExampleLog,
    ]),
    teachingPlaybook,
  });
}

function mapUserInteractionType(currentPhaseType: string | null, intent: QuestionIntent | null) {
  if (intent && intent !== "phase_response") return "student_question" as const;
  if (currentPhaseType === "quiz") return "quiz_answer" as const;
  if (currentPhaseType === "self_reflection") return "reflection" as const;
  if (currentPhaseType === "continuity_check") return "homework_check" as const;
  return "student_response" as const;
}

function mapAssistantInteractionType(
  currentPhaseType: string | null,
  intent: QuestionIntent | null,
  completed: boolean,
) {
  if (intent && intent !== "phase_response") return "agent_answer" as const;
  if (completed) return "session_event" as const;
  if (currentPhaseType === "quiz") return "quiz_question" as const;
  if (currentPhaseType === "self_reflection") return "reflection" as const;
  return "phase_prompt" as const;
}

async function ensureTutoringSession(params: {
  topicId: string;
  access: NonNullable<Awaited<ReturnType<typeof getStudentTopicAccess>>>;
  sessionId?: string;
  studyLanguage: string;
}) {
  const previousSession = await getLatestCompletedLearningSession({
    classroomStudentId: params.access.classroomStudent.id,
    topicId: params.topicId,
    sessionType: "tutoring",
  });
  const previousReport = await getLatestStudentProgressReport({
    topicId: params.topicId,
    classroomStudentId: params.access.classroomStudent.id,
  });

  let tutorSession =
    (params.sessionId
      ? await getDb().query.learningSessions.findFirst({
          where: and(
            eq(learningSessions.id, params.sessionId),
            eq(learningSessions.topicId, params.topicId),
            eq(learningSessions.classroomStudentId, params.access.classroomStudent.id),
          ),
        })
      : null) ??
    (await getActiveLearningSession({
      classroomStudentId: params.access.classroomStudent.id,
      topicId: params.topicId,
      sessionType: "tutoring",
      sessionLocale: params.studyLanguage,
    }));

  if (!tutorSession) {
    const state = buildLearningSessionState({
      topic: params.access.topic,
      previousSession: previousSession
        ? {
            sessionId: previousSession.id,
            summary: previousSession.summary ?? "",
            homeworkAssigned: previousReport?.report.homeworkAssigned ?? [],
            identifiedGaps: previousReport?.report.identifiedGaps ?? [],
            performanceByConcept: previousReport?.report.performanceByConcept ?? [],
          }
        : null,
      previousReport: previousReport?.report ?? null,
    });

    tutorSession = await createLearningSession({
      classroomStudentId: params.access.classroomStudent.id,
      topicId: params.topicId,
      sessionType: "tutoring",
      sessionLocale: params.studyLanguage,
      state,
    });
  }

  const parsedStateResult = learningSessionStateSchema.safeParse(tutorSession.state ?? {});
  let parsedState = parsedStateResult.success
    ? parsedStateResult.data
    : learningSessionStateSchema.parse({});
  if (!parsedStateResult.success || parsedState.phases.length === 0 || parsedState.conceptsToCover.length === 0) {
    parsedState = buildLearningSessionState({
      topic: params.access.topic,
      previousSession: previousSession
        ? {
            sessionId: previousSession.id,
            summary: previousSession.summary ?? "",
            homeworkAssigned: previousReport?.report.homeworkAssigned ?? [],
            identifiedGaps: previousReport?.report.identifiedGaps ?? [],
            performanceByConcept: previousReport?.report.performanceByConcept ?? [],
          }
        : null,
      previousReport: previousReport?.report ?? null,
    });

    await updateLearningSessionState({
      sessionId: tutorSession.id,
      state: parsedState,
    });
    tutorSession = (await getLearningSessionById(tutorSession.id)) ?? tutorSession;
  }

  const hydratedState = await hydrateSessionTeachingPlaybook({
    state: parsedState,
    access: params.access,
    previousSession,
    previousReport,
  });

  if (JSON.stringify(hydratedState) !== JSON.stringify(parsedState)) {
    parsedState = hydratedState;
    await updateLearningSessionState({
      sessionId: tutorSession.id,
      state: parsedState,
    });
    tutorSession = (await getLearningSessionById(tutorSession.id)) ?? tutorSession;
  }

  const messages = await listLearningMessages(tutorSession.id);

  if (messages.length === 0) {
    const { runtimeContext } = await buildTutoringRuntimeContext({
      access: params.access,
      teachingPlaybook: parsedState.teachingPlaybook,
    });
    const result = await runTutoringSessionTurn({
      state: parsedState,
      access: params.access,
      runtimeContext: {
        ...runtimeContext,
        metadata: {
          ...(runtimeContext.metadata ?? {}),
          studyLanguage: params.studyLanguage,
          sourceContentLanguage: params.access.topic.contentLocale,
        },
      },
    });

    await updateLearningSessionState({
      sessionId: tutorSession.id,
      state: result.state,
    });

    if (result.response.trim()) {
      const phase = result.state.phases.find(
        (item) => item.id === result.state.currentPhaseId,
      );
      await appendLearningMessage({
        sessionId: tutorSession.id,
        role: "assistant",
        content: result.response,
        metadata: {
          phaseType: phase?.type ?? null,
        },
      });
      await logLearningInteraction({
        classroomStudentId: params.access.classroomStudent.id,
        topicId: params.topicId,
        sessionId: tutorSession.id,
        role: "assistant",
        interactionType: mapAssistantInteractionType(phase?.type ?? null, null, false),
        content: result.response,
        phaseId: phase?.id ?? null,
        phaseType: phase?.type ?? null,
        conceptKey: phase?.conceptKey ?? null,
      });
    }

    tutorSession = (await getLearningSessionById(tutorSession.id)) ?? tutorSession;
  }

  return tutorSession;
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
      searchParams.get("language") ?? session.user.uiLocale ?? session.user.preferredLanguage ?? "en",
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
  let aiRunId: string | null = null;
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const access = await getStudentTopicAccess(session.user.id, topicId);
    const body = (await request.json()) as {
      sessionId?: string;
      message?: string;
      language?: string;
    };
    const studyLanguage = normalizeAppLocale(
      body.language ?? session.user.uiLocale ?? session.user.preferredLanguage ?? "en",
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

    if (!body.message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const scopeDecision = await evaluateScopePolicy({
      feature: "tutoring_chat",
      objective: `Help the student learn ${access.topic.title} using teacher-approved material`,
      currentPhase: "active tutoring session",
      activeTopic: access.topic.title,
      latestUserMessage: body.message.trim(),
      strictMode: true,
      driftCount: 0,
      allowedDetours: [
        "brief clarification of the current concept",
        "asking what a current term means",
        "replying in another supported language while staying on lesson",
      ],
    });

    if (scopeDecision.shouldRedirect) {
      const tutorSession = await ensureTutoringSession({
        topicId,
        access,
        sessionId: body.sessionId,
        studyLanguage,
      });
      await appendLearningMessage({
        sessionId: tutorSession.id,
        role: "user",
        content: body.message.trim(),
        metadata: {
          phaseType: "scope_redirect",
        },
      });
      await appendLearningMessage({
        sessionId: tutorSession.id,
        role: "assistant",
        content: scopeDecision.redirectMessage,
        metadata: {
          phaseType: "scope_redirect",
          classification: scopeDecision.classification,
        },
      });
      await recordAiFeedbackEvent({
        userId: session.user.id,
        source: "scope_policy",
        feedbackType:
          scopeDecision.promptInjectionSignal === "none"
            ? "redirected"
            : "prompt_injection_detected",
        payload: {
          topicId,
          sessionId: tutorSession.id,
          classification: scopeDecision.classification,
          promptInjectionSignal: scopeDecision.promptInjectionSignal,
          reason: scopeDecision.reason,
        },
      }).catch(() => undefined);

      return NextResponse.json({
        success: true,
        data: {
          sessionId: tutorSession.id,
          sessionLocale: studyLanguage,
          sourceLocale: access.topic.contentLocale,
          response: scopeDecision.redirectMessage,
          completed: false,
          assistantMessage: {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: scopeDecision.redirectMessage,
            metadata: {
              phaseType: "scope_redirect",
              classification: scopeDecision.classification,
            },
            createdAt: new Date().toISOString(),
          },
        },
      });
    }

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      sessionId: body.sessionId,
      studyLanguage,
    });

    const startingState = learningSessionStateSchema.parse(tutorSession.state ?? {});
    const { runtimeContext, contextLayers } = await buildTutoringRuntimeContext({
      access,
      teachingPlaybook: startingState.teachingPlaybook,
    });
    aiRunId = await createAiRunTrace({
      feature: "tutoring_chat",
      scenarioType: "session_turn",
      status: "running",
      userId: session.user.id,
      organizationId: access.topic.classroom.organizationId,
      actorRole: getPlatformRole(session.user),
      resourceType: "learning_session",
      resourceId: tutorSession.id,
      metadata: {
        topicId,
        classroomStudentId: access.classroomStudent.id,
        guidanceVersionIds: runtimeContext.metadata?.guidanceVersionIds,
        studyLanguage,
        sourceContentLanguage: access.topic.contentLocale,
      },
    });
    await recordAiContextLayers(aiRunId, contextLayers);
    runtimeContext.aiRunId = aiRunId;
    runtimeContext.userId = session.user.id;
    runtimeContext.organizationId = access.topic.classroom.organizationId;
    runtimeContext.resourceType = "learning_session";
    runtimeContext.resourceId = tutorSession.id;
    runtimeContext.metadata = {
      ...(runtimeContext.metadata ?? {}),
      studyLanguage,
      sourceContentLanguage: access.topic.contentLocale,
    };
    const startingPhase =
      startingState.phases.find((phase) => phase.id === startingState.currentPhaseId) ??
      null;

    await appendLearningMessage({
      sessionId: tutorSession.id,
      role: "user",
      content: body.message.trim(),
      metadata: {
        phaseType: startingPhase?.type ?? null,
      },
    });

    const result = await runTutoringSessionTurn({
      state: startingState,
      access,
      userMessage: body.message.trim(),
      runtimeContext,
    });

    const resultingPhase =
      result.state.phases.find((phase) => phase.id === result.state.currentPhaseId) ?? null;

    const currentConceptKey =
      resultingPhase?.conceptKey ??
      startingState.conceptsToCover.find((concept) => !startingState.completedConceptKeys.includes(concept.key))
        ?.key ??
      null;
    const currentConceptTitle =
      startingState.conceptsToCover.find((concept) => concept.key === currentConceptKey)?.title ??
      startingState.conceptsToCover[0]?.title ??
      access.topic.title;
    const mediaRecommendation = await selectTutorMedia({
      organizationId: access.topic.classroom.organizationId,
      topicId,
      classroomId: access.topic.classroomId,
      gradeBand: access.topic.classroom.gradeBand,
      currentPhaseType: resultingPhase?.type ?? startingPhase?.type ?? null,
      conceptKey: currentConceptKey,
      conceptTitle: currentConceptTitle,
      gapCount: result.state.gapsIdentified.length,
    });
    await recordAiStep({
      runId: aiRunId,
      stepKey: "tutoring-media-selection",
      stepType: "media_selection",
      payload: {
        topicId,
        phaseType: resultingPhase?.type ?? startingPhase?.type ?? null,
        conceptKey: currentConceptKey,
        conceptTitle: currentConceptTitle,
        gapCount: result.state.gapsIdentified.length,
        selected: mediaRecommendation
          ? {
              title: mediaRecommendation.title,
              assetType: mediaRecommendation.assetType,
              selectionSource: mediaRecommendation.selectionSource,
            }
          : null,
      },
      outputSummary: mediaRecommendation
        ? `Selected ${mediaRecommendation.assetType} from ${mediaRecommendation.selectionSource}`
        : "No tutoring media selected for this turn",
    }).catch(() => undefined);

    await logLearningInteraction({
      classroomStudentId: access.classroomStudent.id,
      topicId,
      sessionId: tutorSession.id,
      role: "user",
      interactionType: mapUserInteractionType(startingPhase?.type ?? null, result.userIntent),
      content: body.message.trim(),
      phaseId: startingPhase?.id ?? null,
      phaseType: startingPhase?.type ?? null,
      conceptKey: startingPhase?.conceptKey ?? null,
      questionType: result.userIntent,
    });

    if (result.response.trim()) {
      const assistantMetadata = {
        phaseType: resultingPhase?.type ?? null,
        completed: result.completed,
        ...(mediaRecommendation
          ? {
              tutorMedia: {
                assetId: mediaRecommendation.assetId ?? null,
                externalMediaId: mediaRecommendation.externalMediaId ?? null,
                assetType: mediaRecommendation.assetType,
                title: mediaRecommendation.title,
                description: mediaRecommendation.description,
                mediaUrl: mediaRecommendation.mediaUrl,
                thumbnailUrl: mediaRecommendation.thumbnailUrl,
                durationSeconds: mediaRecommendation.durationSeconds,
                selectionSource: mediaRecommendation.selectionSource,
                reason: mediaRecommendation.reason,
                expectedBenefit: mediaRecommendation.expectedBenefit,
                followUpPrompt: mediaRecommendation.followUpPrompt,
              },
            }
          : {}),
      };
      await appendLearningMessage({
        sessionId: tutorSession.id,
        role: "assistant",
        content: result.response,
        metadata: assistantMetadata,
      });

      await logLearningInteraction({
        classroomStudentId: access.classroomStudent.id,
        topicId,
        sessionId: tutorSession.id,
        role: "assistant",
        interactionType: mapAssistantInteractionType(
          resultingPhase?.type ?? null,
          result.userIntent,
          result.completed,
        ),
        content: result.response,
        phaseId: resultingPhase?.id ?? null,
        phaseType: resultingPhase?.type ?? null,
        conceptKey: resultingPhase?.conceptKey ?? null,
        metadata: mediaRecommendation
          ? {
              tutorMedia: {
                title: mediaRecommendation.title,
                assetType: mediaRecommendation.assetType,
                selectionSource: mediaRecommendation.selectionSource,
              },
            }
          : undefined,
      });

      if (mediaRecommendation) {
        await logTutorMediaUsage({
          topicId,
          sessionId: tutorSession.id,
          classroomStudentId: access.classroomStudent.id,
          aiRunId,
          recommendation: mediaRecommendation,
        });
      }
    }

    if (result.completed) {
      const previousReport = await getLatestStudentProgressReport({
        topicId,
        classroomStudentId: access.classroomStudent.id,
      });
      await completeLearningSession({
        sessionId: tutorSession.id,
        state: result.state,
      });

      await enqueueTutoringReportGeneration({
        sessionId: tutorSession.id,
        topicId,
        organizationId: access.topic.classroom.organizationId,
        studentUserId: session.user.id,
        classroomStudentId: access.classroomStudent.id,
        studentName: access.classroomStudent.fullName,
        topicTitle: access.topic.title,
        sourceLocale: access.topic.contentLocale,
        previousReport: previousReport?.report ?? null,
        subjectKey: access.topic.subjectKey,
      }).catch((error) => {
        console.error("[learning:topic-chat] failed to enqueue tutoring report", {
          sessionId: tutorSession.id,
          topicId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
    } else {
      await updateLearningSessionState({
        sessionId: tutorSession.id,
        state: result.state,
      });
    }

    await finishAiRunTrace(aiRunId, {
      status: "completed",
      outputText: result.response,
      metadata: {
        completed: result.completed,
        gapCount: result.state.gapsIdentified.length,
        usedMedia: Boolean(mediaRecommendation),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: tutorSession.id,
        sessionLocale: studyLanguage,
        sourceLocale: access.topic.contentLocale,
        response: result.response,
        completed: result.completed,
        sessionState: result.state,
        assistantMessage: {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.response,
          metadata: {
            phaseType: resultingPhase?.type ?? null,
            completed: result.completed,
            ...(mediaRecommendation ? { tutorMedia: mediaRecommendation } : {}),
          },
          createdAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    if (aiRunId) {
      await finishAiRunTrace(aiRunId, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Failed to continue tutoring",
      }).catch(() => undefined);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to continue tutoring" },
      { status: 400 },
    );
  }
}

