import {
  expertFrameworkSchema,
  type ExpertFramework,
} from "@/lib/learning/types";

export const DEFAULT_DEEP_FRAMEWORK_KEY = "deep-default";

export const DEFAULT_DEEP_FRAMEWORK = expertFrameworkSchema.parse({
  name: "DEEP",
  description:
    "Seed framework for new courses. Experts can edit the teaching brief and few-shot examples.",
  fewShotExamples: [],
});

export function createDefaultDeepFramework(): ExpertFramework {
  return expertFrameworkSchema.parse(DEFAULT_DEEP_FRAMEWORK);
}
