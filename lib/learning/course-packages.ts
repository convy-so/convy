import {
  coursePackageRegistry,
  type CoursePackage,
} from "@/lib/ai-core";
import { DEEP_FRAMEWORK_KEY } from "@/lib/learning/framework-packages";

const mathematicsCourse = coursePackageRegistry.register({
  key: "mathematics",
  label: "Mathematics",
  frameworkKey: DEEP_FRAMEWORK_KEY,
  competencyModel: [
    "procedural",
    "conceptual",
    "relational",
    "generative",
  ],
  allowedSocraticMoves: [
    "why_does_this_work",
    "break_the_condition",
    "prove_from_scratch",
    "generalise_this",
    "connect_this_to_something_else",
  ],
  assessmentModes: [
    "self_explanation",
    "transfer_challenge",
    "constraint_change",
    "proof_reconstruction",
  ],
  transferRules: [
    "Prefer structurally similar but superficially different problems.",
    "Distinguish genuine reasoning from memorized procedures.",
  ],
  originalityRules: [
    "Ask for generalization, novel proof framing, or constrained conjecture.",
    "Reward valid alternate structures, not only the canonical path.",
  ],
  promptExamples: [
    {
      input: "Student differentiates x^3 correctly but cannot explain what derivative means.",
      output:
        "Ask what the derivative says about how the function is changing at a point before showing more procedure.",
    },
  ],
  metadata: {
    pedagogy:
      "Push beyond procedural fluency toward conceptual, relational, and generative understanding.",
  },
} satisfies CoursePackage);

const physicsCourse = coursePackageRegistry.register({
  key: "physics",
  label: "Physics",
  frameworkKey: DEEP_FRAMEWORK_KEY,
  competencyModel: [
    "prediction",
    "physical_reasoning",
    "model_selection",
    "quantitative_check",
    "experimental_design",
  ],
  allowedSocraticMoves: [
    "predict_reason_calculate",
    "what_does_this_equation_mean_physically",
    "what_would_happen_if",
    "does_this_make_physical_sense",
    "what_does_this_model_assume",
    "design_an_experiment",
  ],
  assessmentModes: [
    "prediction_before_calculation",
    "assumption_check",
    "sense_check",
    "transfer_challenge",
  ],
  transferRules: [
    "Require qualitative prediction and physical reason before equations.",
    "Treat unit checks and sense checks as part of understanding, not optional cleanup.",
  ],
  originalityRules: [
    "Ask for thought experiments or school-lab experiment design.",
    "Preserve the bridge between physical intuition and mathematics.",
  ],
  promptExamples: [
    {
      input: "Student jumps straight to pendulum formula.",
      output:
        "Stop the calculation and ask for a qualitative prediction about period change with a physical reason first.",
    },
  ],
  metadata: {
    pedagogy:
      "Keep the student moving between physical intuition and mathematical modeling instead of living in only one world.",
  },
} satisfies CoursePackage);

const generalScienceCourse = coursePackageRegistry.register({
  key: "general_science",
  label: "General Science",
  frameworkKey: DEEP_FRAMEWORK_KEY,
  competencyModel: ["conceptual", "transfer", "reflection"],
  allowedSocraticMoves: ["explain_in_own_words", "test_the_model", "transfer_it"],
  assessmentModes: ["self_explanation", "transfer_challenge"],
  transferRules: ["Use near and far transfer before concluding understanding is strong."],
  originalityRules: ["Keep originality constrained to grounded scientific reasoning."],
} satisfies CoursePackage);

export function getCoursePackage(key?: string | null) {
  if (!key) return generalScienceCourse;
  return coursePackageRegistry.get(key) ?? generalScienceCourse;
}

export function listCoursePackages() {
  return coursePackageRegistry.list();
}

export function registerCoursePackage(coursePackage: CoursePackage) {
  return coursePackageRegistry.register(coursePackage);
}

export { mathematicsCourse, physicsCourse };
