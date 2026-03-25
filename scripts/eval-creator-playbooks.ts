import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildRefinementAssistantResponse,
  compilePlaybookAuthorInput,
} from "@/lib/education/playbook-workflow";
import type { PlaybookAuthorInput } from "@/lib/education/playbooks";
import type { ResearchBrief } from "@/lib/education/types";

type PlaybookEvalCase = {
  id: string;
  description: string;
  input: PlaybookAuthorInput;
  expected: {
    status: string;
    requiresClarification?: boolean;
    blockedReasonsCount?: number;
    minBlockedReasons?: number;
    minClarificationQuestions?: number;
    minUsefulnessScore?: number;
    minSpecificityScore?: number;
    minDerivedMetrics?: number;
    mustMentionOneOf?: string[];
  };
};

type RefinementEvalCase = {
  id: string;
  description: string;
  input: {
    creatorMessage: string;
    surveyTitle: string;
    currentPersonalityLabel: string;
    playbookSummaries: string[];
    latestSampleTranscript: string;
    brief: Partial<ResearchBrief>;
  };
  expected: {
    allowedProposalTypes?: string[];
    disallowedProposalTypes?: string[];
    maxProposalCount?: number;
    replyShouldAskClarifyingQuestion?: boolean;
  };
};

function buildBrief(input: Partial<ResearchBrief>): ResearchBrief {
  return {
    programId: "education.course_efficacy",
    title: "Fixture Brief",
    researchGoal: "Understand participant experience",
    decisionToInform: "Improve the program",
    audienceDefinition: "Students",
    audienceRelationship: "",
    audienceKnowledgeLevel: "",
    learningContext: "Training program",
    deliveryContext: "Online",
    timeWindow: "Past 30 days",
    requiredTopics: [],
    successCriteria: [],
    analysisQuestions: [],
    requiredQuestions: [],
    metrics: [],
    personalInfo: [],
    riskFlags: [],
    constraints: [],
    assumptions: [],
    tone: "empathetic",
    media: [],
    routingConfidence: 1,
    routingRationale: "fixture",
    missingFields: [],
    readyForSampling: true,
    ...input,
  };
}

async function loadJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runPlaybookEvals(cases: PlaybookEvalCase[]) {
  for (const testCase of cases) {
    const result = await compilePlaybookAuthorInput(testCase.input);
    assert(result.status === testCase.expected.status, `[${testCase.id}] expected status ${testCase.expected.status}, got ${result.status}`);

    if (typeof testCase.expected.requiresClarification === "boolean") {
      const actual = result.interpretation.clarificationQuestions.length > 0;
      assert(actual === testCase.expected.requiresClarification, `[${testCase.id}] clarification expectation mismatch`);
    }

    if (typeof testCase.expected.blockedReasonsCount === "number") {
      assert(
        result.interpretation.blockedReasons.length === testCase.expected.blockedReasonsCount,
        `[${testCase.id}] expected blocked reason count ${testCase.expected.blockedReasonsCount}, got ${result.interpretation.blockedReasons.length}`,
      );
    }

    if (typeof testCase.expected.minBlockedReasons === "number") {
      assert(
        result.interpretation.blockedReasons.length >= testCase.expected.minBlockedReasons,
        `[${testCase.id}] expected at least ${testCase.expected.minBlockedReasons} blocked reasons`,
      );
    }

    if (typeof testCase.expected.minClarificationQuestions === "number") {
      assert(
        result.interpretation.clarificationQuestions.length >= testCase.expected.minClarificationQuestions,
        `[${testCase.id}] expected at least ${testCase.expected.minClarificationQuestions} clarification questions`,
      );
    }

    if (typeof testCase.expected.minUsefulnessScore === "number") {
      assert(
        result.interpretation.usefulnessScore >= testCase.expected.minUsefulnessScore,
        `[${testCase.id}] usefulness score below threshold`,
      );
    }

    if (typeof testCase.expected.minSpecificityScore === "number") {
      assert(
        result.interpretation.specificityScore >= testCase.expected.minSpecificityScore,
        `[${testCase.id}] specificity score below threshold`,
      );
    }

    if (typeof testCase.expected.minDerivedMetrics === "number") {
      assert(
        result.interpretation.derivedMetrics.length >= testCase.expected.minDerivedMetrics,
        `[${testCase.id}] expected at least ${testCase.expected.minDerivedMetrics} derived metrics`,
      );
    }

    if (testCase.expected.mustMentionOneOf?.length) {
      const haystack = [
        result.interpretation.summary,
        ...result.interpretation.styleDirectives,
        ...result.preview.interpretedEffect,
      ]
        .join(" ")
        .toLowerCase();
      assert(
        testCase.expected.mustMentionOneOf.some((item) => haystack.includes(item.toLowerCase())),
        `[${testCase.id}] expected interpretation to mention one of: ${testCase.expected.mustMentionOneOf.join(", ")}`,
      );
    }
  }
}

async function runRefinementEvals(cases: RefinementEvalCase[]) {
  for (const testCase of cases) {
    const result = await buildRefinementAssistantResponse({
      ...testCase.input,
      brief: buildBrief(testCase.input.brief),
    });
    const types = result.proposals.map((proposal) => proposal.type);

    if (typeof testCase.expected.maxProposalCount === "number") {
      assert(
        result.proposals.length <= testCase.expected.maxProposalCount,
        `[${testCase.id}] expected at most ${testCase.expected.maxProposalCount} proposals, got ${result.proposals.length}`,
      );
    }

    for (const allowed of testCase.expected.allowedProposalTypes ?? []) {
      assert(types.includes(allowed as never), `[${testCase.id}] expected proposal type ${allowed}`);
    }

    for (const disallowed of testCase.expected.disallowedProposalTypes ?? []) {
      assert(!types.includes(disallowed as never), `[${testCase.id}] did not expect proposal type ${disallowed}`);
    }

    if (testCase.expected.replyShouldAskClarifyingQuestion) {
      const reply = result.reply.toLowerCase();
      assert(
        reply.includes("?") || reply.includes("clarify") || reply.includes("do you mean"),
        `[${testCase.id}] expected a clarifying reply`,
      );
    }
  }
}

async function main() {
  const baseDir = path.join(process.cwd(), "evals", "creator-playbooks");
  const playbookCases = await loadJson<PlaybookEvalCase[]>(path.join(baseDir, "playbook-interpretation.json"));
  const refinementCases = await loadJson<RefinementEvalCase[]>(path.join(baseDir, "refinement-proposals.json"));

  await runPlaybookEvals(playbookCases);
  await runRefinementEvals(refinementCases);

  console.log(`Creator playbook evals passed: ${playbookCases.length + refinementCases.length} cases`);
}

main().catch((error) => {
  console.error("Creator playbook evals failed");
  console.error(error);
  process.exit(1);
});
