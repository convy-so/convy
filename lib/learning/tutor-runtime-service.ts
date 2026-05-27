import { contentScopeService } from "@/lib/learning/content-scope-service";
import { buildStudentTeachingPlaybook } from "@/lib/learning/pattern-memory-service";
import { tutoringPromptService } from "@/lib/learning/tutoring-prompt-service";
import { getTopicWithMaterials } from "@/lib/learning/storage";
import { getActiveExpertFrameworkBundle } from "@/lib/learning/storage";
import {
  createDefaultLearningSessionState,
  learningSessionStateSchema,
  type LearningSessionState,
  type StudentInterestProfile,
  type TopicSourceBoundary,
} from "@/lib/learning/types";
import {
  logTutoringDebug,
} from "@/lib/learning/tutoring-debug";

function isContentScopeCurrent(params: {
  snapshot: LearningSessionState["contentScopeSnapshot"];
  topicId: string;
  packVersion: number;
}) {
  return (
    Boolean(params.snapshot) &&
    params.snapshot?.topicId === params.topicId &&
    params.snapshot?.groundingPackVersion === params.packVersion &&
    params.packVersion > 0
  );
}

export class TutorRuntimeService {
  private async resolveContentScope(params: {
    topicId: string;
    sourceBoundary: TopicSourceBoundary;
    studyLanguage: string;
    existingSnapshot?: LearningSessionState["contentScopeSnapshot"];
  }) {
    const topic = await getTopicWithMaterials(params.topicId);
    const packVersion = topic?.topicGroundingPack?.version ?? 0;
    logTutoringDebug("runtime:resolve-content-scope:start", {
      topicId: params.topicId,
      studyLanguage: params.studyLanguage,
      packVersion,
      hasExistingSnapshot: Boolean(params.existingSnapshot),
    });

    if (
      isContentScopeCurrent({
        snapshot: params.existingSnapshot ?? null,
        topicId: params.topicId,
        packVersion,
      })
    ) {
      logTutoringDebug("runtime:resolve-content-scope:reuse-snapshot", {
        topicId: params.topicId,
        packVersion,
      });
      return params.existingSnapshot!;
    }

    const scope = await contentScopeService.buildScopeFromPack({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      contentLocale: params.studyLanguage,
    });
    logTutoringDebug("runtime:resolve-content-scope:built", {
      topicId: params.topicId,
      packVersion: scope.groundingPackVersion,
      materialIds: scope.materialIds,
      learningOutcomes: scope.learningOutcomes.length,
    });
    return scope;
  }

  async initializeSessionState(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    studyLanguage: string;
  }): Promise<LearningSessionState> {
    logTutoringDebug("runtime:initialize-session-state:start", {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      studyLanguage: params.studyLanguage,
    });
    const [activeFramework, contentScope] = await Promise.all([
      getActiveExpertFrameworkBundle(params.topicId),
      contentScopeService.buildScopeFromPack({
        topicId: params.topicId,
        sourceBoundary: params.sourceBoundary,
        contentLocale: params.studyLanguage,
      }),
    ]);
    logTutoringDebug("runtime:initialize-session-state:resolved", {
      topicId: params.topicId,
      frameworkVersionId: activeFramework.frameworkVersionId,
      contentScopeVersion: contentScope.groundingPackVersion,
      materialIds: contentScope.materialIds,
    });

    return learningSessionStateSchema.parse({
      ...createDefaultLearningSessionState(),
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      frameworkVersionId: activeFramework.frameworkVersionId,
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
  }) {
    logTutoringDebug("runtime:prepare-turn:start", {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      studyLanguage: params.studyLanguage,
      turnCount: params.state.turnCount,
      hasInterestProfile: Boolean(params.interestProfile),
    });
    const activeFramework = await getActiveExpertFrameworkBundle(params.topicId);
    const contentScope = await this.resolveContentScope({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      studyLanguage: params.studyLanguage,
      existingSnapshot: params.state.contentScopeSnapshot,
    });
    const playbookResult = params.studentUserId
      ? await buildStudentTeachingPlaybook({
          studentUserId: params.studentUserId,
          subjectKey: params.subjectKey ?? null,
          subjectLabel: params.subjectLabel ?? null,
          topicLocalGaps: [],
          topicLocalUsedExamples: [],
        })
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
    });

    const systemPrompt = tutoringPromptService.buildStudentTurnPrompt({
      contentScope,
      activeFramework,
      interestProfile: params.interestProfile,
      teachingPlaybook: playbookResult.playbook,
      memoryState: playbookResult.memoryState,
      studyLanguage: params.studyLanguage,
    });

    const nextState = learningSessionStateSchema.parse({
      ...params.state,
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      frameworkVersionId: activeFramework.frameworkVersionId,
      groundingPackVersion: contentScope.groundingPackVersion,
      contentScopeSnapshot: contentScope,
    });
    logTutoringDebug("runtime:prepare-turn:done", {
      topicId: params.topicId,
      frameworkVersionId: activeFramework.frameworkVersionId,
      contentScopeVersion: contentScope.groundingPackVersion,
      systemPromptLength: systemPrompt.length,
      nextTurnCount: nextState.turnCount,
    });

    return {
      activeFramework,
      contentScope,
      teachingPlaybook: playbookResult.playbook,
      teachingPlaybookState: playbookResult.memoryState,
      systemPrompt,
      nextState,
    };
  }
}

export const tutorRuntimeService = new TutorRuntimeService();
