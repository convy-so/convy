import { frameworkEngine } from "@/lib/learning/framework-engine";
import { contentScopeService } from "@/lib/learning/content-scope-service";
import { expertRuntimeModelService } from "@/lib/learning/expert-runtime-model-service";
import { studentModelService } from "@/lib/learning/student-model-service";
import { tutoringPromptService } from "@/lib/learning/tutoring-prompt-service";
import { getTopicWithMaterials } from "@/lib/learning/storage";
import {
  createDefaultLearningSessionState,
  type ExpertTutorRuntimeModel,
  frameworkStateSchema,
  learningSessionStateSchema,
  studentModelSnapshotSchema,
  type ContentScopeSnapshot,
  type LearningSessionState,
  type StudentModelSnapshot,
  type TopicSourceBoundary,
} from "@/lib/learning/types";

function createEmptyStudentSnapshot(): StudentModelSnapshot {
  return studentModelSnapshotSchema.parse({
    updatedAt: new Date().toISOString(),
  });
}

function createInitialFrameworkState(runtimeModel: ExpertTutorRuntimeModel) {
  return frameworkStateSchema.parse({
    currentPhaseId: runtimeModel.compiledPolicy?.defaultPhaseId ?? null,
    currentLevelId: runtimeModel.compiledPolicy?.defaultLevelId ?? null,
    diagnosticStatus: runtimeModel.compiledPolicy?.turnPolicy.diagnosisFirst
      ? "not_started"
      : "in_progress",
    recommendedMove: "probe",
    transferPending:
      runtimeModel.compiledPolicy?.completionPolicy.requireTransfer ?? false,
    reflectionPending:
      runtimeModel.compiledPolicy?.completionPolicy.requireMetacognitiveReflection ??
      false,
    lastTransitionAt: new Date().toISOString(),
    lastTransitionReason: "Initialized from published runtime model",
  });
}

function isContentScopeCurrent(params: {
  snapshot: ContentScopeSnapshot | null | undefined;
  topicId: string;
  packVersion: number;
}) {
  return (
    Boolean(params.snapshot) &&
    params.snapshot?.topicId === params.topicId &&
    params.packVersion > 0 &&
    params.snapshot?.groundingPackVersion === params.packVersion
  );
}

export class TutorRuntimeService {
  private async resolveContentScope(params: {
    topicId: string;
    sourceBoundary: TopicSourceBoundary;
    studyLanguage: string;
    existingSnapshot?: ContentScopeSnapshot | null;
  }) {
    const topic = await getTopicWithMaterials(params.topicId);
    const packVersion = topic?.topicGroundingPack?.version ?? 0;

    if (
      isContentScopeCurrent({
        snapshot: params.existingSnapshot,
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

  private async loadRuntimeAndStudentContext(params: {
    topicId: string;
    classroomId?: string | null;
    classroomStudentId: string;
    studentUserId?: string | null;
  }) {
    const runtimeModel = await expertRuntimeModelService.getRuntimeModel({
      topicId: params.topicId,
      classroomId: params.classroomId,
    });
    const studentModel = await studentModelService.ensureModel({
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId,
    });
    const latestSnapshotRecord = await studentModelService.getLatestSnapshot(studentModel.id);
    const latestSnapshot = latestSnapshotRecord?.snapshot ?? createEmptyStudentSnapshot();

    return {
      runtimeModel,
      studentModel,
      latestSnapshotRecord,
      latestSnapshot,
    };
  }

  private async decideFrameworkState(params: {
    runtimeModel: Awaited<ReturnType<typeof expertRuntimeModelService.getRuntimeModel>>;
    state: LearningSessionState;
    latestSnapshot: StudentModelSnapshot;
    latestStudentMessage: string;
    latestTutorMessage?: string | null;
    sessionId?: string | null;
    studentUserId?: string | null;
  }) {
    return await frameworkEngine.decideNextState({
      runtimeModel: params.runtimeModel,
      frameworkState: params.state.frameworkState,
      studentModel: params.latestSnapshot,
      latestStudentMessage: params.latestStudentMessage,
      latestTutorMessage: params.latestTutorMessage,
      sessionId: params.sessionId,
      userId: params.studentUserId,
    });
  }

  async initializeSessionState(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    classroomId?: string | null;
    classroomStudentId: string;
    studentUserId?: string | null;
    studyLanguage: string;
  }): Promise<LearningSessionState> {
    const {
      runtimeModel,
      studentModel,
      latestSnapshotRecord,
      latestSnapshot,
    } = await this.loadRuntimeAndStudentContext({
      topicId: params.topicId,
      classroomId: params.classroomId,
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId,
    });
    const contentScope = await contentScopeService.buildScopeFromPack({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      contentLocale: params.studyLanguage,
    });

    return learningSessionStateSchema.parse({
      ...createDefaultLearningSessionState(),
      topicTitle: params.topicTitle,
      runtimeModelId: runtimeModel.id,
      runtimeModelVersion: runtimeModel.version,
      studentModelId: studentModel.id,
      studentModelSnapshotId: latestSnapshotRecord?.id ?? null,
      frameworkState: createInitialFrameworkState(runtimeModel),
      contentScopeSnapshot: contentScope,
      tutorNotes: [
        `Framework seeded from ${runtimeModel.framework.name}.`,
        `Topic grounding pack v${contentScope.groundingPackVersion} loaded for session.`,
        `Student model version ${latestSnapshot.version} is active.`,
        runtimeModel.compiledPolicy?.policySummary
          ? `Framework policy: ${runtimeModel.compiledPolicy.policySummary}`
          : null,
      ].filter((note): note is string => Boolean(note)),
    });
  }

  async prepareTurn(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    classroomId?: string | null;
    classroomStudentId: string;
    studentUserId?: string | null;
    sessionId?: string | null;
    studyLanguage: string;
    state: LearningSessionState;
    latestStudentMessage: string;
    latestTutorMessage?: string | null;
  }) {
    const {
      runtimeModel,
      studentModel,
      latestSnapshotRecord,
      latestSnapshot,
    } = await this.loadRuntimeAndStudentContext({
      topicId: params.topicId,
      classroomId: params.classroomId,
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId,
    });

    const contentScope = await this.resolveContentScope({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      studyLanguage: params.studyLanguage,
      existingSnapshot: params.state.contentScopeSnapshot,
    });

    const frameworkState = await this.decideFrameworkState({
      runtimeModel,
      state: params.state,
      latestSnapshot,
      latestStudentMessage: params.latestStudentMessage,
      latestTutorMessage: params.latestTutorMessage,
      sessionId: params.sessionId,
      studentUserId: params.studentUserId,
    });
    const systemPrompt = tutoringPromptService.buildStudentTurnPrompt({
      contentScope,
      runtimeModel,
      studentModel: latestSnapshot,
      frameworkState,
      studyLanguage: params.studyLanguage,
    });

    const nextState = learningSessionStateSchema.parse({
      ...params.state,
      runtimeModelId: runtimeModel.id,
      runtimeModelVersion: runtimeModel.version,
      studentModelId: studentModel.id,
      studentModelSnapshotId: latestSnapshotRecord?.id ?? null,
      frameworkState,
      contentScopeSnapshot: contentScope,
    });

    return {
      runtimeModel,
      studentModel,
      latestStudentSnapshot: latestSnapshot,
      latestStudentSnapshotRecord: latestSnapshotRecord,
      contentScope,
      frameworkState,
      systemPrompt,
      nextState,
    };
  }

  async prepareAgentTurn(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    classroomId?: string | null;
    classroomStudentId: string;
    studentUserId?: string | null;
    sessionId?: string | null;
    studyLanguage: string;
    state: LearningSessionState;
    latestStudentMessage: string;
    latestTutorMessage?: string | null;
  }) {
    return this.prepareTurn(params);
  }
}

export const tutorRuntimeService = new TutorRuntimeService();
