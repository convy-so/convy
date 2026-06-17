import assert from "node:assert/strict";

import {
  expertFrameworkSchema,
  getIncompleteExpertFrameworkCapabilityIds,
  hasCompleteExpertFrameworkCapabilityGuidance,
} from "@/lib/learning/types";

function run() {
  const legacy = expertFrameworkSchema.parse({
    name: "Legacy framework",
    description: "Old artifact",
    toolUsageGuidance: "Use tools thoughtfully.",
    fewShotExamples: [],
    markdownContent: "Teach carefully.",
    metadata: {},
  });

  assert.deepEqual(
    getIncompleteExpertFrameworkCapabilityIds(legacy),
    [
      "search_image",
      "search_video",
      "administer_quiz",
      "grade_student_work",
      "finish_session",
    ],
  );
  assert.equal(hasCompleteExpertFrameworkCapabilityGuidance(legacy), false);

  const complete = expertFrameworkSchema.parse({
    ...legacy,
    capabilityGuidance: {
      search_image: "Use clear diagrams when useful.",
      search_video: "Use videos for motion or sequence.",
      administer_quiz: "Quiz when a formal check is needed.",
      grade_student_work: "Grade only submitted quiz answers.",
      finish_session: "Finish only with evidence and next steps.",
    },
  });

  assert.equal(hasCompleteExpertFrameworkCapabilityGuidance(complete), true);
  assert.equal(
    complete.capabilityGuidance.finish_session,
    "Finish only with evidence and next steps.",
  );

  console.log("learning-framework-schema tests passed");
}

run();
