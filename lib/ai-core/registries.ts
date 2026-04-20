import type {
  PromptSpec,
  RetrievalAdapter,
} from "@/lib/ai-core/types";

export interface CoursePackage {
  key: string;
  label: string;
  frameworkKey: string;
  competencyModel: string[];
  allowedSocraticMoves: string[];
  assessmentModes: string[];
  transferRules: string[];
  originalityRules: string[];
  promptExamples?: Array<{ input: string; output: string }>;
  metadata?: Record<string, unknown>;
}

export interface TeachingFrameworkStage {
  key: string;
  label: string;
  objective: string;
  requiredOutputs: string[];
}

export interface TeachingFrameworkPackage {
  key: string;
  label: string;
  stages: TeachingFrameworkStage[];
  metadata?: Record<string, unknown>;
}

class KeyedRegistry<T extends { key: string }> {
  protected readonly items = new Map<string, T>();

  register(item: T) {
    this.items.set(item.key, item);
    return item;
  }

  get(key: string) {
    return this.items.get(key) ?? null;
  }

  list() {
    return Array.from(this.items.values());
  }
}

class IdRegistry<T extends { id: string }> {
  protected readonly items = new Map<string, T>();

  register(item: T) {
    this.items.set(item.id, item);
    return item;
  }

  get(id: string) {
    return this.items.get(id) ?? null;
  }

  list() {
    return Array.from(this.items.values());
  }
}

export class CoursePackageRegistry extends KeyedRegistry<CoursePackage> {}

export class TeachingFrameworkRegistry extends KeyedRegistry<TeachingFrameworkPackage> {}

export class PromptSpecRegistry extends IdRegistry<PromptSpec> {}

export class RetrievalAdapterRegistry extends KeyedRegistry<RetrievalAdapter> {}

export const coursePackageRegistry = new CoursePackageRegistry();
export const teachingFrameworkRegistry = new TeachingFrameworkRegistry();
export const promptSpecRegistry = new PromptSpecRegistry();
export const retrievalAdapterRegistry = new RetrievalAdapterRegistry();
