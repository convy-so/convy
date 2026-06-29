import { buildStudentTeachingPlaybook } from "@/features/tutoring/server/pattern-memory-service";
import { buildStudentTurnPromptRuntime } from "@/features/tutoring/server/prompts/student-turn";
import { buildLessonContentScopeFromPack } from "@/features/tutoring/server/lesson-grounding-pack-service";
import { TUTOR_CAPABILITY_IDS } from "@/features/tutoring/server/tutor-capabilities";
import { getCachedActiveFrameworkBundleForLesson } from "@/features/tutoring/server/framework-runtime-storage";
import {
  createDefaultStudentSessionState,
  studentSessionStateSchema,
  type StudentSessionState,
  type StudentInterestProfile,
  type LessonSourceBoundary,
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
    if (params.existingSnapshot) {
      return params.existingSnapshot;
    }

    return await buildLessonContentScopeFromPack({
      lessonId: params.lessonId,
      sourceBoundary: params.sourceBoundary,
      contentLocale: params.studyLanguage,
    });
  }

  async initializeSessionState(params: {
    lessonId: string;
    lessonTitle: string;
    sourceBoundary: LessonSourceBoundary;
    studyLanguage: string;
  }): Promise<StudentSessionState> {
    const [activeFramework, contentScope] = await Promise.all([
      getCachedActiveFrameworkBundleForLesson(params.lessonId),
      buildLessonContentScopeFromPack({
        lessonId: params.lessonId,
        sourceBoundary: params.sourceBoundary,
        contentLocale: params.studyLanguage,
      }),
    ]);

    const missingCapabilityIds = TUTOR_CAPABILITY_IDS.filter(
      (capabilityId) =>
        !activeFramework.framework.capabilityGuidance[capabilityId].policy.trim(),
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
    const activeFramework =
      params.state.activeFrameworkSnapshot ??
      (await getCachedActiveFrameworkBundleForLesson(params.lessonId));
    const missingCapabilityIds = TUTOR_CAPABILITY_IDS.filter(
      (capabilityId) =>
        !activeFramework.framework.capabilityGuidance[capabilityId].policy.trim(),
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
      ? await buildStudentTeachingPlaybook({
          studentUserId,
          subjectKey: params.subjectKey ?? null,
          subjectLabel: params.subjectLabel ?? null,
          lessonLocalGaps: [],
          lessonLocalUsedExamples: [],
        })
      : {
          playbook: null,
          memoryState: {
            status: "unavailable" as const,
            message: "Long-horizon memory is unavailable for this session.",
          },
        };

    const systemPrompt = buildStudentTurnPromptRuntime({
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
