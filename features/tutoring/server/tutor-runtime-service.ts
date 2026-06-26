import { contentScopeService } from "@/features/tutoring/server/content-scope-service";
import { buildStudentTeachingPlaybook } from "@/features/tutoring/server/pattern-memory-service";
import { tutoringPromptService } from "@/features/tutoring/server/tutoring-prompt-service";
import { getCachedLessonWithMaterials } from "@/features/tutoring/public-server";
import { getCachedActiveFrameworkBundleForLesson } from "@/features/tutoring/server/framework-runtime-storage";
import {
  createDefaultStudentSessionState,
  getIncompleteExpertFrameworkCapabilityIds,
  studentSessionStateSchema,
  type StudentSessionState,
  type StudentInterestProfile,
  type LessonSourceBoundary,
} from "@/features/tutoring/public-server";
import {
  logTutoringDebug,
  createTutoringTimer,
  measureTutoringStep,
} from "@/features/tutoring/public-server";

function getFrameworkCapabilityReadinessErrorMessage(
  frameworkName: string,
  missingCapabilityIds: string[],
) {
  if (missingCapabilityIds.length === 0) {
    return null;
  }

  return `The active expert framework "${frameworkName}" is missing required capability policy for: ${missingCapabilityIds.join(", ")}. An expert must update and reactivate the framework before tutoring can continue.`;
}

export class TutorRuntimeService {
  private async resolveContentScope(params: {
    lessonId: string;
    sourceBoundary: LessonSourceBoundary;
    studyLanguage: string;
    existingSnapshot?: StudentSessionState["contentScopeSnapshot"];
  }) {
    const timer = createTutoringTimer();
    logTutoringDebug("runtime:resolve-content-scope:start", {
      lessonId: params.lessonId,
      studyLanguage: params.studyLanguage,
      hasExistingSnapshot: Boolean(params.existingSnapshot),
    });

    if (params.existingSnapshot) {
      logTutoringDebug("runtime:resolve-content-scope:reuse-snapshot", {
        lessonId: params.lessonId,
        packVersion: params.existingSnapshot.groundingPackVersion,
        durationMs: timer.elapsedMs(),
      });
      return params.existingSnapshot;
    }

    const lesson = await measureTutoringStep(
      "runtime:resolve-content-scope:lesson",
      {
        lessonId: params.lessonId,
        studyLanguage: params.studyLanguage,
      },
      async () => await getCachedLessonWithMaterials(params.lessonId),
    );
    const packVersion = lesson?.lessonGroundingPack?.version ?? 0;

    const scope = await measureTutoringStep(
      "runtime:resolve-content-scope:build",
      {
        lessonId: params.lessonId,
        studyLanguage: params.studyLanguage,
        packVersion,
      },
      async () =>
        await contentScopeService.buildScopeFromPack({
          lessonId: params.lessonId,
          sourceBoundary: params.sourceBoundary,
          contentLocale: params.studyLanguage,
        }),
    );
    logTutoringDebug("runtime:resolve-content-scope:built", {
      lessonId: params.lessonId,
      packVersion: scope.groundingPackVersion,
      materialIds: scope.materialIds,
      learningOutcomes: scope.learningOutcomes.length,
      durationMs: timer.elapsedMs(),
    });
    return scope;
  }

  async initializeSessionState(params: {
    lessonId: string;
    lessonTitle: string;
    sourceBoundary: LessonSourceBoundary;
    studyLanguage: string;
  }): Promise<StudentSessionState> {
    const timer = createTutoringTimer();
    logTutoringDebug("runtime:initialize-session-state:start", {
      lessonId: params.lessonId,
      lessonTitle: params.lessonTitle,
      studyLanguage: params.studyLanguage,
    });
    const [activeFramework, contentScope] = await Promise.all([
      measureTutoringStep(
        "runtime:initialize-session-state:framework",
        {
          lessonId: params.lessonId,
          studyLanguage: params.studyLanguage,
        },
        async () => await getCachedActiveFrameworkBundleForLesson(params.lessonId),
      ),
      measureTutoringStep(
        "runtime:initialize-session-state:content-scope",
        {
          lessonId: params.lessonId,
          studyLanguage: params.studyLanguage,
        },
        async () =>
          await contentScopeService.buildScopeFromPack({
            lessonId: params.lessonId,
            sourceBoundary: params.sourceBoundary,
            contentLocale: params.studyLanguage,
          }),
      ),
    ]);
    logTutoringDebug("runtime:initialize-session-state:resolved", {
      lessonId: params.lessonId,
      frameworkId: activeFramework.frameworkId,
      contentScopeVersion: contentScope.groundingPackVersion,
      materialIds: contentScope.materialIds,
      durationMs: timer.elapsedMs(),
    });

    const missingCapabilityIds = getIncompleteExpertFrameworkCapabilityIds(
      activeFramework.framework,
    );
    const readinessError = getFrameworkCapabilityReadinessErrorMessage(
      activeFramework.framework.name,
      missingCapabilityIds,
    );
    if (readinessError) {
      throw new Error(readinessError);
    }

    return studentSessionStateSchema.parse({
      ...createDefaultStudentSessionState(),
      lessonId: params.lessonId,
      lessonTitle: params.lessonTitle,
      frameworkId: activeFramework.frameworkId,
      activeFrameworkSnapshot: activeFramework,
      groundingPackVersion: contentScope.groundingPackVersion,
      contentScopeSnapshot: contentScope,
      tutorNotes: [
        `Framework ${activeFramework.frameworkId} is active.`,
        `Lesson grounding pack v${contentScope.groundingPackVersion} loaded for session.`,
      ],
    });
  }

  async prepareTurn(params: {
    lessonId: string;
    lessonTitle: string;
    subjectKey?: string | null;
    subjectLabel?: string | null;
    sourceBoundary: LessonSourceBoundary;
    studentUserId?: string | null;
    studyLanguage: string;
    state: StudentSessionState;
    interestProfile: StudentInterestProfile | null;
    recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
    latestUserText: string;
  }) {
    const timer = createTutoringTimer();
    logTutoringDebug("runtime:prepare-turn:start", {
      lessonId: params.lessonId,
      lessonTitle: params.lessonTitle,
      studyLanguage: params.studyLanguage,
      turnCount: params.state.turnCount,
      hasInterestProfile: Boolean(params.interestProfile),
    });
    const activeFramework =
      params.state.activeFrameworkSnapshot ??
      (await measureTutoringStep(
        "runtime:prepare-turn:framework",
        {
          lessonId: params.lessonId,
          studyLanguage: params.studyLanguage,
        },
        async () => await getCachedActiveFrameworkBundleForLesson(params.lessonId),
      ));
    if (params.state.activeFrameworkSnapshot) {
      logTutoringDebug("runtime:prepare-turn:framework:reuse-snapshot", {
        lessonId: params.lessonId,
        studyLanguage: params.studyLanguage,
        frameworkId: activeFramework.frameworkId,
      });
    }
    const missingCapabilityIds = getIncompleteExpertFrameworkCapabilityIds(
      activeFramework.framework,
    );
    const readinessError = getFrameworkCapabilityReadinessErrorMessage(
      activeFramework.framework.name,
      missingCapabilityIds,
    );
    if (readinessError) {
      throw new Error(readinessError);
    }
    const contentScope = await this.resolveContentScope({
      lessonId: params.lessonId,
      sourceBoundary: params.sourceBoundary,
      studyLanguage: params.studyLanguage,
      existingSnapshot: params.state.contentScopeSnapshot,
    });
    const studentUserId = params.studentUserId;
    const playbookResult = studentUserId
      ? await measureTutoringStep(
          "runtime:prepare-turn:playbook",
          {
            lessonId: params.lessonId,
            studyLanguage: params.studyLanguage,
            studentUserId,
          },
          async () =>
            await buildStudentTeachingPlaybook({
              studentUserId,
              subjectKey: params.subjectKey ?? null,
              subjectLabel: params.subjectLabel ?? null,
              lessonLocalGaps: [],
              lessonLocalUsedExamples: [],
            }),
        )
      : {
          playbook: null,
          memoryState: {
            status: "unavailable" as const,
            message: "Long-horizon memory is unavailable for this session.",
          },
        };
    logTutoringDebug("runtime:prepare-turn:playbook", {
      lessonId: params.lessonId,
      playbookState: playbookResult.memoryState.status,
      hasPlaybook: Boolean(playbookResult.playbook),
      durationMs: timer.elapsedMs(),
    });

    const systemPrompt = tutoringPromptService.buildStudentTurnPrompt({
      contentScope,
      activeFramework,
      interestProfile: params.interestProfile,
      teachingPlaybook: playbookResult.playbook,
      memoryState: playbookResult.memoryState,
      state: params.state,
      recentMessages: params.recentMessages,
      latestUserText: params.latestUserText,
      studyLanguage: params.studyLanguage,
    });

    const nextState = studentSessionStateSchema.parse({
      ...params.state,
      lessonId: params.lessonId,
      lessonTitle: params.lessonTitle,
      frameworkId: activeFramework.frameworkId,
      activeFrameworkSnapshot: activeFramework,
      groundingPackVersion: contentScope.groundingPackVersion,
      contentScopeSnapshot: contentScope,
    });
    logTutoringDebug("runtime:prepare-turn:done", {
      lessonId: params.lessonId,
      frameworkId: activeFramework.frameworkId,
      contentScopeVersion: contentScope.groundingPackVersion,
      systemPromptLength: systemPrompt.dynamicSystemPrompt.length,
      staticPromptLength: systemPrompt.staticSystemPrompt.length,
      nextTurnCount: nextState.turnCount,
      durationMs: timer.elapsedMs(),
    });

    return {
      activeFramework,
      contentScope,
      teachingPlaybook: playbookResult.playbook,
      teachingPlaybookState: playbookResult.memoryState,
      systemPrompt: systemPrompt.dynamicSystemPrompt,
      staticSystemPrompt: systemPrompt.staticSystemPrompt,
      contextBundle: systemPrompt.contextBundle,
      promptCache: systemPrompt.promptCache,
      groundingUnits: systemPrompt.groundingUnits,
      nextState,
    };
  }
}

export const tutorRuntimeService = new TutorRuntimeService();

