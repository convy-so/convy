import assert from "node:assert/strict";

import { expertFrameworkSchema } from "@/features/tutoring/server/expert-framework-schemas";

function run() {
  const legacyResult = expertFrameworkSchema.safeParse({
    name: "Legacy framework",
    description: "Old artifact",
    capabilityGuidance: {
      search_image: "Use diagrams when useful.",
      search_video: "Use videos for motion.",
      administer_quiz: "Quiz when needed.",
      grade_student_work: "Grade submitted work only.",
      finish_session: "Finish with evidence.",
    },
    fewShotExamples: [],
    markdownContent: "Teach carefully.",
  });
  assert.equal(legacyResult.success, false);

  const invalidMediaLimitResult = expertFrameworkSchema.safeParse({
    name: "Invalid media limits",
    description: "",
    capabilityGuidance: {
      search_image: {
        enabled: true,
        policy: "Use images when they materially clarify a grounded idea.",
        maxUsesPerTurn: 6,
      },
      finish_session: {
        policy: "Finish only with evidence and a concrete next step.",
      },
    },
    fewShotExamples: [],
    markdownContent: "",
  });
  assert.equal(invalidMediaLimitResult.success, false);

  const legacyExampleResult = expertFrameworkSchema.safeParse({
    name: "Legacy examples",
    description: "",
    capabilityGuidance: {
      finish_session: {
        policy: "Finish only with evidence and a concrete next step.",
      },
    },
    fewShotExamples: [
      {
        title: "Factor check",
        studentMessage: "I think it is x+2 and x+2.",
        tutorResponse: "Check the product and the middle term.",
      },
    ],
    markdownContent: "",
  });
  assert.equal(legacyExampleResult.success, false);

  const finishSessionToggleResult = expertFrameworkSchema.safeParse({
    name: "Invalid finish-session shape",
    description: "",
    capabilityGuidance: {
      finish_session: {
        enabled: false,
        policy: "Finish only with evidence and a concrete next step.",
      },
    },
    fewShotExamples: [],
    markdownContent: "",
  });
  assert.equal(finishSessionToggleResult.success, false);

  const incomplete = expertFrameworkSchema.parse({
    name: "Structured framework",
    description: "Draft policy coverage",
    capabilityGuidance: {
      search_image: {
        enabled: true,
        policy: "",
        maxUsesPerTurn: 3,
      },
      search_video: {
        enabled: false,
        policy: "",
        maxUsesPerTurn: 2,
      },
      administer_quiz: {
        enabled: true,
        policy: "Use quiz cards only for explicit checks of one concept.",
      },
      grade_student_work: {
        enabled: false,
        policy: "",
      },
      finish_session: {
        policy: "",
      },
    },
    fewShotExamples: [],
    markdownContent: "Teach carefully.",
  });

  const complete = expertFrameworkSchema.parse({
    ...incomplete,
    capabilityGuidance: {
      search_image: {
        enabled: true,
        policy: "Use image search only when a grounded concept benefits from a single visual check.",
        maxUsesPerTurn: 3,
      },
      search_video: {
        enabled: false,
        policy: "",
        maxUsesPerTurn: 2,
      },
      administer_quiz: {
        enabled: true,
        policy: "Use one quiz card only after the student has had a supported attempt.",
      },
      grade_student_work: {
        enabled: false,
        policy: "",
      },
      finish_session: {
        policy: "Finish only with concrete evidence of covered outcomes and a next step.",
      },
    },
  });

  assert.equal(complete.capabilityGuidance.search_image.maxUsesPerTurn, 3);
  assert.equal(
    complete.capabilityGuidance.finish_session.policy,
    "Finish only with concrete evidence of covered outcomes and a next step.",
  );

  console.log("learning-framework-schema tests passed");
}

run();
