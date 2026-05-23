import { nanoid } from "nanoid";

import {
  compileFrameworkArtifact,
  ensureFrameworkPolicyReady,
} from "@/lib/learning/framework-compiler";
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

export class ExpertRuntimeModelService {
  async getRuntimeModel(params: {
    topicId: string;
    classroomId?: string | null;
  }): Promise<ExpertTutorRuntimeModel> {
    const framework = await ensureTopicFramework({
      topicId: params.topicId,
      classroomId: params.classroomId,
    });
    const frameworkVersion = await getActiveFrameworkVersion(params.topicId);
    if (!frameworkVersion) {
      throw new Error("Active framework version not found.");
    }

    const published = await getPublishedRuntimeModel(params.topicId);
    if (published && published.frameworkVersionId === frameworkVersion.id) {
      const parsedPublished = expertTutorRuntimeModelSchema.safeParse(
        published.runtimeModel,
      );
      if (parsedPublished.success && parsedPublished.data.compiledPolicy) {
        return parsedPublished.data;
      }
    }

    const compiledFramework =
      ensureFrameworkPolicyReady(frameworkVersion.framework) ??
      (await compileFrameworkArtifact(frameworkVersion.framework)).metadata
        .compiledPolicy;

    if (!compiledFramework) {
      throw new Error(
        "The active framework version is not ready for tutoring. Publish a framework that compiles successfully first.",
      );
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
      compiledPolicy: compiledFramework,
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
