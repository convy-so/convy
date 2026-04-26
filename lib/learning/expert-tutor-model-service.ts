import { nanoid } from "nanoid";

import {
  expertTutorRuntimeModelSchema,
  type ExpertTutorRuntimeModel,
} from "@/lib/learning/types";
import {
  createRuntimeModel,
  ensureTopicFramework,
  getActiveFrameworkVersion,
  getPublishedRuntimeModel,
  listApprovedCrystallizations,
  listOpenConflicts,
} from "@/lib/learning/storage";

export class ExpertTutorModelService {
  async getRuntimeModel(params: {
    topicId: string;
    classroomId?: string | null;
  }): Promise<ExpertTutorRuntimeModel> {
    const published = await getPublishedRuntimeModel(params.topicId);
    if (published) {
      return expertTutorRuntimeModelSchema.parse(published.runtimeModel);
    }

    const framework = await ensureTopicFramework({
      topicId: params.topicId,
      classroomId: params.classroomId,
    });
    const frameworkVersion = await getActiveFrameworkVersion(params.topicId);
    if (!frameworkVersion) {
      throw new Error("Active framework version not found.");
    }

    const [approvedCrystallizations, openConflicts] = await Promise.all([
      listApprovedCrystallizations({
        topicId: params.topicId,
        frameworkVersionId: frameworkVersion.id,
      }),
      listOpenConflicts({ topicId: params.topicId }),
    ]);

    const blockedCrystallizationIds = new Set(
      openConflicts
        .map((conflict) => conflict.crystallizationId)
        .filter((value): value is string => Boolean(value)),
    );

    const runtimeModel = expertTutorRuntimeModelSchema.parse({
      id: nanoid(),
      version: 1,
      frameworkVersionId: frameworkVersion.id,
      framework: frameworkVersion.framework,
      heuristics: approvedCrystallizations
        .filter((item) => !blockedCrystallizationIds.has(item.id))
        .map((item) => item.heuristic),
      conflictIds: openConflicts.map((conflict) => conflict.id),
      seedSource: frameworkVersion.seedSource === "deep_default"
        ? "deep_default"
        : "expert_authored",
    });

    await createRuntimeModel({
      topicId: params.topicId,
      frameworkId: framework.id,
      frameworkVersionId: frameworkVersion.id,
      runtimeModel,
      conflictIds: runtimeModel.conflictIds,
      status: "published",
    });

    return runtimeModel;
  }
}

export const expertTutorModelService = new ExpertTutorModelService();
