import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { learningSessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getLearningSessionById } from "@/lib/learning/storage";
import { getStudentTopicAccess } from "@/lib/learning/access";
import { buildTeachingPlaybook, deriveSubjectInfo } from "@/lib/learning/patterns";
import { generateTeacherProgressReport } from "@/lib/learning/reporting";
import {
  buildLearningSessionState,
  runTutoringSessionTurn,
} from "@/lib/learning/session-engine";
import {
  appendLearningMessage,
  completeLearningSession,
  createLearningSession,
  createStudentProgressReport,
  getActiveLearningSession,
  getLatestCompletedLearningSession,
  getLatestStudentProgressReport,
  listLearningInteractions,
  listLearningMessages,
  listStudentLearningPatternProfiles,
  logLearningInteraction,
  updateLearningSessionState,
} from "@/lib/learning/storage";
import { enqueueLearningPatternAnalysis } from "@/lib/queue";
import {
  learningSessionStateSchema,
  type LearningSessionState,
  type QuestionIntent,
} from "@/lib/learning/types";
import type { LearningTeachingPlaybook } from "@/lib/learning/pattern-types";

function computeMasteryPercent(state: LearningSessionState) {
  if (state.conceptsToCover.length === 0) return 0;

  const scores = state.conceptsToCover.map((concept) => {
    const conceptState = state.conceptStates[concept.key];
    return conceptState?.masteryScore ?? 0;
  });

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
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
      sessionLocale: params.access.topic.contentLocale,
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
    const result = await runTutoringSessionTurn({
      state: parsedState,
      access: params.access,
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
  _request: Request,
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

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
    });
    const messages = await listLearningMessages(tutorSession.id);
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});

    return NextResponse.json({
      success: true,
      data: {
        sessionId: tutorSession.id,
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
    const body = (await request.json()) as { sessionId?: string; message?: string };

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

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      sessionId: body.sessionId,
    });

    const startingState = learningSessionStateSchema.parse(tutorSession.state ?? {});
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
    });

    const resultingPhase =
      result.state.phases.find((phase) => phase.id === result.state.currentPhaseId) ?? null;

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
      await appendLearningMessage({
        sessionId: tutorSession.id,
        role: "assistant",
        content: result.response,
        metadata: {
          phaseType: resultingPhase?.type ?? null,
          completed: result.completed,
        },
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
      });
    }

    if (result.completed) {
      const interactions = await listLearningInteractions({
        classroomStudentId: access.classroomStudent.id,
        sessionId: tutorSession.id,
      });
      const previousReport = await getLatestStudentProgressReport({
        topicId,
        classroomStudentId: access.classroomStudent.id,
      });
      const report = await generateTeacherProgressReport({
        studentName: access.classroomStudent.fullName,
        topicTitle: access.topic.title,
        state: result.state,
        interactions: interactions.map((interaction) => ({
          role: interaction.role,
          interactionType: interaction.interactionType,
          content: interaction.content,
          metadata: interaction.metadata as Record<string, unknown> | null,
        })),
        sessionStartedAt: tutorSession.createdAt,
        sessionCompletedAt: new Date(),
        previousReport: previousReport?.report ?? null,
      });

      await createStudentProgressReport({
        topicId,
        classroomStudentId: access.classroomStudent.id,
        generatedFromSessionId: tutorSession.id,
        masteryPercent: computeMasteryPercent(result.state),
        sourceLocale: access.topic.contentLocale,
        report,
      });

      await completeLearningSession({
        sessionId: tutorSession.id,
        summary: report.studentSummary,
        state: result.state,
      });

      await enqueueLearningPatternAnalysis({
        sourceType: "session",
        sourceId: tutorSession.id,
        organizationId: access.topic.classroom.organizationId,
        studentUserId: session.user.id,
        classroomStudentId: access.classroomStudent.id,
        topicId,
        subjectKey: access.topic.subjectKey,
      }).catch((error) => {
        console.error("[Learning Chat] Failed to enqueue pattern analysis:", error);
      });
    } else {
      await updateLearningSessionState({
        sessionId: tutorSession.id,
        state: result.state,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: tutorSession.id,
        response: result.response,
        completed: result.completed,
        sessionState: result.state,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to continue tutoring" },
      { status: 400 },
    );
  }
}
