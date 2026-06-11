import assert from "node:assert/strict";

import { validateBrief } from "@/lib/education/creation-workflow";
import type { ResearchBrief } from "@/lib/education/types";

const requiredFields = [
  "researchGoal",
  "decisionToInform",
  "audienceDefinition",
  "learningContext",
  "studyContext",
  "timeWindow",
  "requiredTopics",
  "successCriteria",
];

function createBrief(status: "thin" | "sufficient"): ResearchBrief {
  return {
    programId: "education.course_efficacy",
    title: "Course Feedback Study",
    researchGoal: "Understand whether students can apply the project skills after the course.",
    decisionToInform: "Decide which parts of the course to revise before the next cohort.",
    audienceDefinition: "Students who completed the project-based course this term.",
    audienceRelationship: "Recent learners",
    audienceKnowledgeLevel: "Direct experience",
    learningContext: "A project-based course for intermediate students.",
    studyContext: "The assignments, support, and practice activities inside the course.",
    timeWindow: "The final two weeks of the course and the first month after completion.",
    requiredTopics: ["applied project skills", "practice barriers", "support moments"],
    successCriteria: [
      "Concrete examples of skills used after instruction",
      "Specific barriers that prevented transfer",
    ],
    analysisQuestions: [],
    requiredQuestions: [],
    metrics: [],
    personalInfo: [],
    riskFlags: [],
    constraints: [],
    assumptions: [],
    tone: "casual",
    media: [],
    routingConfidence: 0.9,
    routingRationale: "Course outcome intent is explicit.",
    missingFields: [],
    readyForSampling: false,
    creationController: {
      version: 1,
      action: status === "sufficient" ? "complete" : "ask",
      targetField: status === "sufficient" ? null : "successCriteria",
      fieldQuality: requiredFields.map((field) => ({
        field,
        status,
        valueSummary: `Specific ${field} value`,
        evidence: `Creator provided a concrete ${field} detail.`,
        confidence: status === "sufficient" ? 0.85 : 0.5,
        specificity: status === "sufficient" ? 0.85 : 0.5,
        unresolvedIssue:
          status === "sufficient" ? "" : `Need more specific ${field}.`,
        lastAskedQuestion: "",
      })),
      askedFieldHistory: [],
      readinessRationale: "",
    },
  };
}

function run() {
  const thinValidation = validateBrief(
    createBrief("thin"),
    "education.course_efficacy",
  );
  assert.equal(thinValidation.isReady, false);
  assert.ok(thinValidation.missingFields.includes("successCriteria"));
  assert.equal(thinValidation.targetField, "successCriteria");

  const sufficientValidation = validateBrief(
    createBrief("sufficient"),
    "education.course_efficacy",
  );
  assert.equal(sufficientValidation.isReady, true);
  assert.deepEqual(sufficientValidation.missingFields, []);
  assert.equal(sufficientValidation.nextAction, "complete");

  console.log("survey creation controller tests passed");
}

run();
