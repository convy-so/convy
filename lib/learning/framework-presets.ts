import {
  expertFrameworkSchema,
  type ExpertFramework,
} from "@/lib/learning/types";
import { createEmptyCapabilityGuidance } from "@/lib/learning/tutor-capabilities";

export const DEFAULT_DEEP_FRAMEWORK_KEY = "deep-default";

export const DEFAULT_DEEP_FRAMEWORK = expertFrameworkSchema.parse({
  name: "DEEP",
  description:
    "Seed framework for new courses. Experts can edit the description and few-shot examples.",
  capabilityGuidance: createEmptyCapabilityGuidance(),
  fewShotExamples: [],
  markdownContent: "",
  metadata: {},
});

export function createDefaultDeepFramework(): ExpertFramework {
  return expertFrameworkSchema.parse(DEFAULT_DEEP_FRAMEWORK);
}

export function createEmptyExpertFramework(params: {
  name: string;
  description?: string;
}): ExpertFramework {
  return expertFrameworkSchema.parse({
    name: params.name,
    description: params.description ?? "",
    capabilityGuidance: createEmptyCapabilityGuidance(),
    fewShotExamples: [],
    markdownContent: "",
    metadata: {},
  });
}
