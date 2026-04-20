import {
  teachingFrameworkRegistry,
  type TeachingFrameworkPackage,
} from "@/lib/ai-core";

export const DEEP_FRAMEWORK_KEY = "deep";

const deepFramework = teachingFrameworkRegistry.register({
  key: DEEP_FRAMEWORK_KEY,
  label: "DEEP",
  stages: [
    {
      key: "diagnose",
      label: "Diagnose",
      objective: "Surface the student's current mental model and its hidden gaps.",
      requiredOutputs: ["modelFingerprint"],
    },
    {
      key: "expose",
      label: "Expose",
      objective: "Make the most productive gap visible through cognitive dissonance.",
      requiredOutputs: ["productiveGap"],
    },
    {
      key: "extend",
      label: "Extend",
      objective: "Guide the student to reconstruct the stronger model through dialogue.",
      requiredOutputs: ["stageState"],
    },
    {
      key: "probe",
      label: "Probe",
      objective: "Stress-test for transfer instead of pattern matching.",
      requiredOutputs: ["transferChecks"],
    },
    {
      key: "produce",
      label: "Produce",
      objective: "Turn deep understanding into constrained original thinking.",
      requiredOutputs: ["originalProduction"],
    },
  ],
} satisfies TeachingFrameworkPackage);

export function getTeachingFrameworkPackage(key = DEEP_FRAMEWORK_KEY) {
  return teachingFrameworkRegistry.get(key) ?? deepFramework;
}

export function listTeachingFrameworkPackages() {
  return teachingFrameworkRegistry.list();
}
