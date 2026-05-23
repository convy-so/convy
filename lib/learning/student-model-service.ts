import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import { buildStudentModelUpdatePrompt } from "@/lib/learning/prompting";
import {
  studentModelSnapshotSchema,
  type ContentScopeSnapshot,
  type ExpertTutorRuntimeModel,
  type StudentModelSnapshot,
} from "@/lib/learning/types";
import {
  createStudentModelAnalysis,
  createStudentModelSnapshot,
  ensureStudentModel,
  getLatestStudentModelSnapshot,
  getStudentModelByClassroomStudentId,
} from "@/lib/learning/storage";

const studentModelUpdateSchema = studentModelSnapshotSchema.extend({
  updatedAt: z.string(),
});

function buildStudentModelAnalysisNotes(conversationTurnCount: number) {
  return {
    conversationTurnCount,
  };
}

export class StudentModelService {
  async ensureModel(params: {
    classroomStudentId: string;
    studentUserId?: string | null;
  }) {
    const existing = await getStudentModelByClassroomStudentId(
      params.classroomStudentId,
    );

    return existing ??
      (await ensureStudentModel({
        classroomStudentId: params.classroomStudentId,
        studentUserId: params.studentUserId,
      }));
  }

  async getLatestSnapshot(studentModelId: string) {
    return await getLatestStudentModelSnapshot(studentModelId);
  }

  async updateFromConversation(params: {
    studentModelId: string;
    topicId?: string | null;
    sessionId?: string | null;
    sourceType: string;
    sourceId: string;
    userId?: string | null;
    existingSnapshot: StudentModelSnapshot | null;
    contentScope: ContentScopeSnapshot;
    conversationExcerpt: Array<{ role: string; content: string }>;
    runtimeModel?: ExpertTutorRuntimeModel | null;
  }) {
    const snapshot = await generateStructuredOutput({
      schema: studentModelUpdateSchema,
      prompt: buildStudentModelUpdatePrompt({
        existingSnapshot: params.existingSnapshot,
        contentScope: params.contentScope,
        conversationExcerpt: params.conversationExcerpt,
        runtimeModel: params.runtimeModel,
      }),

    });

    const savedSnapshot = await createStudentModelSnapshot({
      studentModelId: params.studentModelId,
      snapshot,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
    });

    await createStudentModelAnalysis({
      studentModelId: params.studentModelId,
      topicId: params.topicId,
      sessionId: params.sessionId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      status: "completed",
      notes: buildStudentModelAnalysisNotes(params.conversationExcerpt.length),
    });

    return savedSnapshot;
  }
}

export const studentModelService = new StudentModelService();
