import assert from "node:assert/strict";

import { getQuizImageGuidance } from "@/lib/learning/quiz-image-guidance";

function run() {
  const guidance = getQuizImageGuidance();

  assert.equal(guidance.length, 4, "expected four photo tips");
  assert.ok(
    guidance.some((item) => item.title === "Use good light"),
    "expected a tip about lighting",
  );
  assert.ok(
    guidance.some((item) => item.title === "Show the whole page"),
    "expected a tip about framing the page",
  );
  assert.ok(
    guidance.some((item) => item.description.includes("more than one page")),
    "expected guidance about multiple images",
  );

  console.log("quiz-image-guidance tests passed");
}

run();
