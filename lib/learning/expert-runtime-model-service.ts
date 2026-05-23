import { nanoid } from "nanoid";

import {
  expertTutorRuntimeModelSchema,
  type ExpertTutorRuntimeModel,
} from "@/lib/learning/types";
import {
  createRuntimeModel,
  getActiveFrameworkVersion,
  getPublishedRuntimeModel,
  getTopicFramework,
  listApprovedCrystallizations,
  listOpenConflicts,
} from "@/lib/learning/storage";

export class ExpertRuntimeModelService {
  async getRuntimeModel(params: {
    topicId: string;
    classroomId?: string | null;
  }): Promise<ExpertTutorRuntimeModel> {
    const framework = await getTopicFramework({ topicId: params.topicId });
    if (!framework) {
      throw new Error(
        "No expert framework exists for this course. Create and publish a framework before activating tutoring.",
      );
    }

    const frameworkVersion = await getActiveFrameworkVersion(params.topicId);
    if (!frameworkVersion) {
      throw new Error(
        "No published framework version is active for this course. Publish a framework version in the expert studio first.",
      );
    }

    const published = await getPublishedRuntimeModel(params.topicId);
    if (published && published.frameworkVersionId === frameworkVersion.id) {
      const parsedPublished = expertTutorRuntimeModelSchema.safeParse(
        published.runtimeModel,
      );
      if (parsedPublished.success) {
        return parsedPublished.data;
      }
    }

    const [approvedCrystallizations, openConflicts] = await Promise.all([
      listApprovedCrystallizations({
        courseId: framework.courseId,
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
      compiledPolicy: null,
      heuristics: approvedCrystallizations
        .filter((item) => !blockedCrystallizationIds.has(item.id))
        .map((item) => item.heuristic),
      conflictIds: openConflicts.map((conflict) => conflict.id),
      seedSource: frameworkVersion.seedSource === "deep_default"
        ? "deep_default"
        : "expert_authored",
    });

    await createRuntimeModel({
      courseId: framework.courseId,
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

export const expertRuntimeModelService = new ExpertRuntimeModelService();
