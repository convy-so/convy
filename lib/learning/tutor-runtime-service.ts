import { frameworkEngine } from "@/lib/learning/framework-engine";
import { contentScopeService } from "@/lib/learning/content-scope-service";
import { expertTutorModelService } from "@/lib/learning/expert-tutor-model-service";
import { studentModelService } from "@/lib/learning/student-model-service";
import { tutoringPromptService } from "@/lib/learning/tutoring-prompt-service";
import {
  createDefaultLearningSessionState,
  learningSessionStateSchema,
  studentModelSnapshotSchema,
  type LearningSessionState,
  type StudentModelSnapshot,
  type TopicSourceBoundary,
} from "@/lib/learning/types";

function createEmptyStudentSnapshot(): StudentModelSnapshot {
  return studentModelSnapshotSchema.parse({
    updatedAt: new Date().toISOString(),
  });
}

export class TutorRuntimeService {
  async initializeSessionState(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    classroomId?: string | null;
    classroomStudentId: string;
    studentUserId?: string | null;
    studyLanguage: string;
  }): Promise<LearningSessionState> {
    const runtimeModel = await expertTutorModelService.getRuntimeModel({
      topicId: params.topicId,
      classroomId: params.classroomId,
    });
    const studentModel = await studentModelService.ensureModel({
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId,
    });
    const latestSnapshot =
      (await studentModelService.getLatestSnapshot(studentModel.id))?.snapshot ??
      createEmptyStudentSnapshot();
    const contentScope = await contentScopeService.buildScope({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      query: params.topicTitle,
      contentLocale: params.studyLanguage,
    });

    return learningSessionStateSchema.parse({
      ...createDefaultLearningSessionState(),
      topicTitle: params.topicTitle,
      runtimeModelId: runtimeModel.id,
      runtimeModelVersion: runtimeModel.version,
      studentModelId: studentModel.id,
      studentModelSnapshotId:
        (await studentModelService.getLatestSnapshot(studentModel.id))?.id ?? null,
      frameworkState: {
        currentStageId: runtimeModel.framework.startStageId,
        completedStageIds: [],
        stageAttemptCounts: {},
        stageStartedAt: {
          [runtimeModel.framework.startStageId]: new Date().toISOString(),
        },
        stageCompletedAt: {},
        lastTransitionAt: new Date().toISOString(),
        lastTransitionReason: "Initialized from published runtime model",
      },
      contentScopeSnapshot: contentScope,
      tutorNotes: [
        `Framework seeded from ${runtimeModel.framework.name}.`,
        `Student model version ${latestSnapshot.version} is active.`,
      ],
    });
  }

  async prepareTurn(params: {
    topicId: string;
    topicTitle: string;
    sourceBoundary: TopicSourceBoundary;
    classroomId?: string | null;
    classroomStudentId: string;
    studentUserId?: string | null;
    studyLanguage: string;
    state: LearningSessionState;
    latestStudentMessage: string;
    latestTutorMessage?: string | null;
  }) {
    const runtimeModel = await expertTutorModelService.getRuntimeModel({
      topicId: params.topicId,
      classroomId: params.classroomId,
    });
    const studentModel = await studentModelService.ensureModel({
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId,
    });
    const latestSnapshotRecord = await studentModelService.getLatestSnapshot(studentModel.id);
    const latestSnapshot = latestSnapshotRecord?.snapshot ?? createEmptyStudentSnapshot();
    const contentScope = await contentScopeService.buildScope({
      topicId: params.topicId,
      sourceBoundary: params.sourceBoundary,
      query: params.latestStudentMessage,
      contentLocale: params.studyLanguage,
    });
    const frameworkState = await frameworkEngine.decideNextState({
      runtimeModel,
      frameworkState: params.state.frameworkState,
      studentModel: latestSnapshot,
      latestStudentMessage: params.latestStudentMessage,
      latestTutorMessage: params.latestTutorMessage,
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
}

export const tutorRuntimeService = new TutorRuntimeService();
