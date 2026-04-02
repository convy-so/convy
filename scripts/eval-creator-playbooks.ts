import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  buildRefinementAssistantResponse,
  compilePlaybookAuthorInput,
} from "@/lib/education/playbook-workflow";
import {
  playbookAuthorInputSchema,
  type PlaybookAuthorInput,
} from "@/lib/education/playbooks";
import { researchBriefSchema, type ResearchBrief } from "@/lib/education/types";

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

const playbookEvalCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  input: playbookAuthorInputSchema,
  expected: z.object({
    status: z.string(),
    requiresClarification: z.boolean().optional(),
    blockedReasonsCount: z.number().optional(),
    minBlockedReasons: z.number().optional(),
    minClarificationQuestions: z.number().optional(),
    minUsefulnessScore: z.number().optional(),
    minSpecificityScore: z.number().optional(),
    minDerivedMetrics: z.number().optional(),
    mustMentionOneOf: z.array(z.string()).optional(),
  }),
});

const refinementEvalCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  input: z.object({
    creatorMessage: z.string(),
    surveyTitle: z.string(),
    currentPersonalityLabel: z.string(),
    playbookSummaries: z.array(z.string()),
    latestSampleTranscript: z.string(),
    brief: researchBriefSchema.partial(),
  }),
  expected: z.object({
    allowedProposalTypes: z.array(z.string()).optional(),
    disallowedProposalTypes: z.array(z.string()).optional(),
    maxProposalCount: z.number().optional(),
    replyShouldAskClarifyingQuestion: z.boolean().optional(),
  }),
});

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

async function loadJson<T>(
  filePath: string,
  parser: (value: unknown) => T,
): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return parser(JSON.parse(raw));
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

    const proposalTypes = new Set(types);

    for (const allowed of testCase.expected.allowedProposalTypes ?? []) {
      assert((proposalTypes as Set<string>).has(allowed), `[${testCase.id}] expected proposal type ${allowed}`);
    }

    for (const disallowed of testCase.expected.disallowedProposalTypes ?? []) {
      assert(!(proposalTypes as Set<string>).has(disallowed), `[${testCase.id}] did not expect proposal type ${disallowed}`);
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
  const playbookCases = await loadJson(
    path.join(baseDir, "playbook-interpretation.json"),
    (value) => z.array(playbookEvalCaseSchema).parse(value),
  );
  const refinementCases = await loadJson(
    path.join(baseDir, "refinement-proposals.json"),
    (value) => z.array(refinementEvalCaseSchema).parse(value),
  );

  await runPlaybookEvals(playbookCases);
  await runRefinementEvals(refinementCases);

}

main().catch((error) => {
  console.error("Creator playbook evals failed");
  console.error(error);
  process.exit(1);
});
