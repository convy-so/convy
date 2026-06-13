import { contentScopeService } from "@/lib/learning/content-scope-service";
import { buildStudentTeachingPlaybook } from "@/lib/learning/pattern-memory-service";
import { tutoringPromptService } from "@/lib/learning/tutoring-prompt-service";
import { getCachedTopicWithMaterials } from "@/lib/learning/storage";
import { getCachedActiveExpertFrameworkBundle } from "@/lib/learning/framework-runtime-storage";
import {
  createDefaultLearningSessionState,
  learningSessionStateSchema,
  type LearningSessionState,
  type StudentInterestProfile,
  type TopicSourceBoundary,
} from "@/lib/learning/types";
import {
  logTutoringDebug,
  createTutoringTimer,
  measureTutoringStep,
} from "@/lib/learning/tutoring-debug";

export class TutorRuntimeService {
  private async resolveContentScope(params: {
    topicId: string;
    sourceBoundary: TopicSourceBoundary;
    studyLanguage: string;
    existingSnapshot?: LearningSessionState["contentScopeSnapshot"];
  }) {
    const timer = createTutoringTimer();
    logTutoringDebug("runtime:resolve-content-scope:start", {
      topicId: params.topicId,
      studyLanguage: params.studyLanguage,
      hasExistingSnapshot: Boolean(params.existingSnapshot),
    });

    if (params.existingSnapshot) {
      logTutoringDebug("runtime:resolve-content-scope:reuse-snapshot", {
        topicId: params.topicId,
        packVersion: params.existingSnapshot.groundingPackVersion,
        durationMs: timer.elapsedMs(),
      });
      return params.existingSnapshot;
    }

    const topic = await measureTutoringStep(
      "runtime:resolve-content-scope:topic",
      {
        topicId: params.topicId,
        studyLanguage: params.studyLanguage,
      },
      async () => await getCachedTopicWithMaterials(params.topicId),
    );
    const packVersion = topic?.topicGroundingPack?.version ?? 0;

    const scope = await measureTutoringStep(
      "runtime:resolve-content-scope:build",
      {
        topicId: params.topicId,
        studyLanguage: params.studyLanguage,
        packVersion,
      },
      async () =>
        await contentScopeService.buildScopeFromPack({
          topicId: params.topicId,
          sourceBoundary: params.sourceBoundary,
          contentLocale: params.studyLanguage,
        }),
    );
    logTutoringDebug("runtime:resolve-content-scope:built", {
      topicId: params.topicId,
      packVersion: scope.groundingPackVersion,
      materialIds: scope.materialIds,
      learningOutcomes: scope.learningOutcomes.length,
      durationMs: timer.elapsedMs(),
    });
    return scope;
  }

  async initializeSessionState(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    studyLanguage: string;
  }): Promise<LearningSessionState> {
    const timer = createTutoringTimer();
    logTutoringDebug("runtime:initialize-session-state:start", {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      studyLanguage: params.studyLanguage,
    });
    const [activeFramework, contentScope] = await Promise.all([
      measureTutoringStep(
        "runtime:initialize-session-state:framework",
        {
          topicId: params.topicId,
          studyLanguage: params.studyLanguage,
        },
        async () => await getCachedActiveExpertFrameworkBundle(params.topicId),
      ),
      measureTutoringStep(
        "runtime:initialize-session-state:content-scope",
        {
          topicId: params.topicId,
          studyLanguage: params.studyLanguage,
        },
        async () =>
          await contentScopeService.buildScopeFromPack({
            topicId: params.topicId,
            sourceBoundary: params.sourceBoundary,
            contentLocale: params.studyLanguage,
          }),
      ),
    ]);
    logTutoringDebug("runtime:initialize-session-state:resolved", {
      topicId: params.topicId,
      frameworkVersionId: activeFramework.frameworkVersionId,
      contentScopeVersion: contentScope.groundingPackVersion,
      materialIds: contentScope.materialIds,
      durationMs: timer.elapsedMs(),
    });

    return learningSessionStateSchema.parse({
      ...createDefaultLearningSessionState(),
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      frameworkVersionId: activeFramework.frameworkVersionId,
      activeFrameworkSnapshot: activeFramework,
      groundingPackVersion: contentScope.groundingPackVersion,
      contentScopeSnapshot: contentScope,
      tutorNotes: [
        `Framework version ${activeFramework.frameworkVersionId} is active.`,
        `Topic grounding pack v${contentScope.groundingPackVersion} loaded for session.`,
      ],
    });
  }

  async prepareTurn(params: {
    topicId: string;
    topicTitle: string;
    subjectKey?: string | null;
    subjectLabel?: string | null;
    sourceBoundary: TopicSourceBoundary;
    studentUserId?: string | null;
    studyLanguage: string;
    state: LearningSessionState;
    interestProfile: StudentInterestProfile | null;
    recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
    latestUserText: string;
  }) {
    const timer = createTutoringTimer();
    logTutoringDebug("runtime:prepare-turn:start", {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      studyLanguage: params.studyLanguage,
      turnCount: params.state.turnCount,
      hasInterestProfile: Boolean(params.interestProfile),
    });
    const activeFramework =
      params.state.activeFrameworkSnapshot ??
      (await measureTutoringStep(
        "runtime:prepare-turn:framework",
        {
          topicId: params.topicId,
          studyLanguage: params.studyLanguage,
        },
        async () => await getCachedActiveExpertFrameworkBundle(params.topicId),
      ));
    if (params.state.activeFrameworkSnapshot) {
      logTutoringDebug("runtime:prepare-turn:framework:reuse-snapshot", {
        topicId: params.topicId,
        studyLanguage: params.studyLanguage,
        frameworkVersionId: activeFramework.frameworkVersionId,
      });
    }
    const contentScope = await this.resolveContentScope({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      studyLanguage: params.studyLanguage,
      existingSnapshot: params.state.contentScopeSnapshot,
    });
    const studentUserId = params.studentUserId;
    const playbookResult = studentUserId
      ? await measureTutoringStep(
          "runtime:prepare-turn:playbook",
          {
            topicId: params.topicId,
            studyLanguage: params.studyLanguage,
            studentUserId,
          },
          async () =>
            await buildStudentTeachingPlaybook({
              studentUserId,
              subjectKey: params.subjectKey ?? null,
              subjectLabel: params.subjectLabel ?? null,
              topicLocalGaps: [],
              topicLocalUsedExamples: [],
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
      topicId: params.topicId,
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

    const nextState = learningSessionStateSchema.parse({
      ...params.state,
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      frameworkVersionId: activeFramework.frameworkVersionId,
      activeFrameworkSnapshot: activeFramework,
      groundingPackVersion: contentScope.groundingPackVersion,
      contentScopeSnapshot: contentScope,
    });
    logTutoringDebug("runtime:prepare-turn:done", {
      topicId: params.topicId,
      frameworkVersionId: activeFramework.frameworkVersionId,
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
