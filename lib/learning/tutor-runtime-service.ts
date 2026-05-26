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

    if (
      isContentScopeCurrent({
        snapshot: params.existingSnapshot ?? null,
        topicId: params.topicId,
        packVersion,
      })
    ) {
      return params.existingSnapshot!;
    }

    return await contentScopeService.buildScopeFromPack({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      contentLocale: params.studyLanguage,
    });
  }

  async initializeSessionState(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    studyLanguage: string;
  }): Promise<LearningSessionState> {
    const [activeFramework, contentScope] = await Promise.all([
      getActiveExpertFrameworkBundle(params.topicId),
      contentScopeService.buildScopeFromPack({
        topicId: params.topicId,
        sourceBoundary: params.sourceBoundary,
        contentLocale: params.studyLanguage,
      }),
    ]);

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
