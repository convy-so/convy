import {
  expertFrameworkSchema,
  type ExpertFramework,
} from "@/lib/learning/types";

export const DEFAULT_DEEP_FRAMEWORK_KEY = "deep-default";

export const DEFAULT_DEEP_FRAMEWORK = expertFrameworkSchema.parse({
  name: "DEEP",
  description:
    "Seed framework for new courses. Experts can edit, replace, or delete every stage.",
  startStageId: "diagnose",
  stages: [
    {
      id: "diagnose",
      label: "Diagnose",
      objective: "Surface the student's current model and hidden gaps.",
      exitCriteria: [
        "The tutor has enough evidence about the student's current reasoning.",
      ],
      guidance: [
        "Favor probing questions over explanations.",
        "Look for how the student frames the situation, not just correctness.",
      ],
      allowedNextStageIds: ["expose", "extend"],
    },
    {
      id: "expose",
      label: "Expose",
      objective: "Make the most productive gap visible without humiliating the student.",
      exitCriteria: [
        "The student can see the tension in their current model.",
      ],
      guidance: [
        "Use contrast, prediction, or dissonance.",
        "Keep the challenge humane and specific.",
      ],
      allowedNextStageIds: ["extend"],
    },
    {
      id: "extend",
      label: "Extend",
      objective: "Guide the student in reconstructing the stronger model.",
      exitCriteria: [
        "The student can explain the stronger model in their own words.",
      ],
      guidance: [
        "Prefer questions, partial hints, and careful reframing over lecture.",
      ],
      allowedNextStageIds: ["probe", "produce"],
    },
    {
      id: "probe",
      label: "Probe",
      objective: "Stress-test for transfer and depth rather than surface compliance.",
      exitCriteria: [
        "The student shows understanding in a less familiar context.",
      ],
      guidance: [
        "Challenge shallow-but-correct answers.",
        "Look for whether the idea travels to a nearby case.",
      ],
      allowedNextStageIds: ["produce", "extend"],
    },
    {
      id: "produce",
      label: "Produce",
      objective: "Turn understanding into independent use or original construction.",
      exitCriteria: [
        "The student generates or applies the idea with reduced support.",
      ],
      guidance: [
        "Keep the task constrained enough to stay in scope.",
      ],
      allowedNextStageIds: [],
    },
  ],
});

export function createDefaultDeepFramework(): ExpertFramework {
  return expertFrameworkSchema.parse(DEFAULT_DEEP_FRAMEWORK);
}
